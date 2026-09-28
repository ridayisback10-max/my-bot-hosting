(function () {
  let lastTradedPeriod = null;
  let intervalId = null;
  let currentAmount = 0;
  let profitCount = 0;
  let expectedResult = null;
  let awaitingResult = false;
  let martingaleStep = 0;
  
  // ইউজার কনফিগারেশন ভ্যালু (ডিফল্ট Virtual 4, Real 6)
  let virtualStepsConfig = 4;
  let realStepsConfig = 6;
  let maxMartingaleSteps = virtualStepsConfig + realStepsConfig; 

  let targetHistoryPage = 2; // ডিফল্ট ২/৫০
  let customProfitLimit = null;
  let isPlacingTrade = false;
  let payout = 1.96;
  let currentStrategyBets = [];
  let consecutiveLossCount = 0; 
  let isRealTradeActive = false; 
  
  // সিকোয়েন্স এবং প্যানেল ট্র্যাকিং ভেরিয়েবল
  let lockedPatternArray = []; 
  let isPatternLocked = false;
  let patternIndexPointer = 0;
  
  // ফিক্সড সাইকেল ক্যাশ মেমোরি
  let lockedCycleBets = [];
  
  // ট্র্যাকিং ভেরিয়েবল - আপডেট ডাটা নিশ্চিত করার জন্য
  let lastTargetPageDataSnapshot = "";
  let lastTargetPagePeriod = null;
  let targetPageUpdateRetries = 0;
  const MAX_TARGET_PAGE_RETRIES = 15;
  
  // Start বাটনের অবস্থা ট্র্যাক
  let isBotRunning = false;
  
  // হাইলাইট ট্র্যাকিং - কোন index এ expected pattern সেট করা আছে
  let highlightedPatternIndex = -1;
  
  // 🆕 Countdown timer এর interval
  let countdownIntervalId = null;

  function roundBetToIntegerDollars(value) {
      if (isNaN(value) || value === Infinity || value === -Infinity) return 0;
      const roundedToTwoDec = Math.round(value * 100) / 100;
      const fractional = roundedToTwoDec - Math.floor(roundedToTwoDec);
      if (fractional >= 0.5) {
          return Math.ceil(roundedToTwoDec);
      } else {
          return Math.floor(roundedToTwoDec);
      }
  }

  function enforceRoundBet(rawBet) {
      let rounded = roundBetToIntegerDollars(rawBet);
      if (rounded < 0) rounded = 0;
      return rounded;
  }

  function generateMTGStrategy(firstBetRounded, payoutValue, totalSteps) {
      if (!firstBetRounded || firstBetRounded <= 0 || !payoutValue || payoutValue <= 1 || !totalSteps || totalSteps < 2) return [];
      
      const targetProfitConst = (firstBetRounded * payoutValue) - firstBetRounded;
      let bets = [firstBetRounded];
      let runningTotal = firstBetRounded;
      
      for (let stepIdx = 1; stepIdx < totalSteps; stepIdx++) {
          let rawNext = (targetProfitConst + runningTotal) / (payoutValue - 1);
          let roundedNext = enforceRoundBet(rawNext);
          if (roundedNext < 0) roundedNext = 0;
          bets.push(roundedNext);
          runningTotal += roundedNext;
      }
      return bets;
  }

  function calculateCycleMetrics(bets, payoutValue) {
      if (!bets || bets.length === 0) return { totalRisk: 0, avgProfit: 0 };
      let runningTotal = 0;
      let stepProfits = [];
      for (let i = 0; i < bets.length; i++) {
          const bet = bets[i];
          runningTotal += bet;
          const stepProfit = (bet * payoutValue) - runningTotal;
          stepProfits.push(stepProfit);
      }
      return { totalRisk: runningTotal, avgProfit: stepProfits.reduce((sum, p) => sum + p, 0) / stepProfits.length };
  }

  function getRiskCompliantCycle(currentBalance, firstBetCandidate, payoutValue, steps) {
      let originalFirstBet = firstBetCandidate;
      if (originalFirstBet <= 0) originalFirstBet = 1;
      let bets = generateMTGStrategy(originalFirstBet, payoutValue, steps);
      let { totalRisk, avgProfit } = calculateCycleMetrics(bets, payoutValue);
      if (totalRisk <= currentBalance) return { bets, totalRisk, avgProfit, success: true };
      
      let low = 1, high = originalFirstBet, bestFirstBet = 1, bestBets = [], bestTotalRisk = 0, bestAvgProfit = 0;
      for (let attempt = 0; attempt < 40; attempt++) {
          let mid = Math.floor((low + high) / 2);
          if (mid < 1) mid = 1;
          let testBets = generateMTGStrategy(mid, payoutValue, steps);
          let { totalRisk: testRisk } = calculateCycleMetrics(testBets, payoutValue);
          if (testRisk <= currentBalance) {
              bestFirstBet = mid;
              bestBets = testBets;
              bestTotalRisk = testRisk;
              bestAvgProfit = calculateCycleMetrics(testBets, payoutValue).avgProfit;
              low = mid + 1;
          } else {
              high = mid - 1;
          }
          if (low > high) break;
      }
      if (bestFirstBet > 0 && bestBets.length > 0) return { bets: bestBets, totalRisk: bestTotalRisk, avgProfit: bestAvgProfit, success: true };
      let fallbackBets = generateMTGStrategy(1, payoutValue, steps);
      let fallbackMetrics = calculateCycleMetrics(fallbackBets, payoutValue);
      return { bets: fallbackBets, totalRisk: fallbackMetrics.totalRisk, avgProfit: fallbackMetrics.avgProfit, success: true };
  }

  function computeFirstBetFromBalance(currentBalance, payoutValue, steps) {
      if (currentBalance <= 0) return 0;
      const m = payoutValue / (payoutValue - 1);
      let sumOfRatios = 0;
      for (let i = 0; i < steps; i++) sumOfRatios += Math.pow(m, i);
      if (sumOfRatios <= 0) return 1;
      return enforceRoundBet(currentBalance / sumOfRatios);
  }

  // --- UI SETUP ---
  const dashboard = document.createElement("div");
  dashboard.id = "floatingDashboard";
  dashboard.style = `
    position: fixed;
    top: 20px;
    left: 20px;
    z-index: 999999;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(15px);
    -webkit-backdrop-filter: blur(15px);
    color: #00ffcc;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 15px;
    padding: 18px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 24px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
    width: 480px; 
    max-height: 95vh;
    overflow-y: auto;
    user-select: none;
  `;
  
  function generateMartingaleDots(steps) {
      let dotsHtml = '';
      for (let i = 1; i <= steps; i++) { 
          dotsHtml += `<span class="martingale-dot" data-step="${i}">${i}</span>`;
      }
      return dotsHtml;
  }
  
  let virtualOptionsHtml = '';
  for (let i = 1; i <= 10; i++) {
      virtualOptionsHtml += `<option value="${i}" ${i === 4 ? 'selected' : ''}>${i} Step${i > 1 ? 's' : ''}</option>`;
  }

  let realOptionsHtml = '';
  for (let i = 2; i <= 10; i++) {
      realOptionsHtml += `<option value="${i}" ${i === 6 ? 'selected' : ''}>${i} Step${i > 1 ? 's' : ''}</option>`;
  }

  let pageOptionsHtml = '';
  for (let i = 1; i <= 50; i++) {
      pageOptionsHtml += `<option value="${i}" ${i === 2 ? 'selected' : ''}>${i}/50</option>`;
  }

  dashboard.innerHTML = `
    <style>
      #floatingDashboard { scrollbar-width: none; }
      #floatingDashboard::-webkit-scrollbar { display: none; }
      .hacker-section { 
        background: rgba(255, 255, 255, 0.03); 
        border: 1px solid rgba(255, 255, 255, 0.08); 
        padding: 12px; 
        border-radius: 16px; 
        margin-bottom: 12px; 
      }
      .hacker-section-title { font-size: 13px; color: #00ffcc; text-align: right; padding-bottom: 4px; font-weight: 600; }
      @keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0.4; } }
      @keyframes shake { 0%, 100% { transform: translateX(0); } 20%, 60% { transform: translateX(-5px); } 40%, 80% { transform: translateX(5px); } }
      .blink-text { animation: blink 1.2s infinite; }
      
      #floatingDashboard button, #floatingDashboard select { 
          background: rgba(255, 255, 255, 0.08); 
          color: #fff; 
          border: 1px solid rgba(255, 255, 255, 0.15); 
          padding: 8px 12px; 
          font-family: inherit; 
          font-size: 13px; 
          font-weight: 500;
          cursor: pointer; 
          border-radius: 12px;
          transition: all 0.25s ease; 
      }
      #floatingDashboard button:hover:not(:disabled) { background: rgba(255, 255, 255, 0.15); }
      #startBtn { background: rgba(16, 185, 129, 0.2); color: #34d399; border-color: rgba(16, 185, 129, 0.4); }
      #stopBtn { background: rgba(239, 68, 68, 0.2); color: #f87171; border-color: rgba(239, 68, 68, 0.4); }
      
      #startBtn:disabled {
          background: rgba(80, 80, 80, 0.3) !important;
          color: rgba(180, 180, 180, 0.5) !important;
          border-color: rgba(120, 120, 120, 0.3) !important;
          cursor: not-allowed !important;
          opacity: 0.6 !important;
          filter: grayscale(0.8) !important;
      }
      #stopBtn:disabled {
          background: rgba(80, 80, 80, 0.2) !important;
          color: rgba(180, 180, 180, 0.4) !important;
          border-color: rgba(120, 120, 120, 0.2) !important;
          cursor: not-allowed !important;
          opacity: 0.5 !important;
      }
      
      .drag-handle { 
          cursor: move; text-align: center; padding: 12px 0 14px 0; color: #fff; font-size: 15px; font-weight: 600;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1); margin: -18px -18px 14px -18px; 
          display: flex; align-items: center; justify-content: center; gap: 8px; position: relative;
          min-height: 42px;
          touch-action: none;
          -webkit-user-select: none;
          user-select: none;
      }
      #closeBtn {
          font-size: 12px; padding: 6px 10px; border: 1px solid rgba(239, 68, 68, 0.4); 
          background: rgba(239, 68, 68, 0.2); color: #f87171; border-radius: 8px;
          position: absolute; top: 50%; right: 12px; transform: translateY(-50%);
          z-index: 10;
          pointer-events: auto;
      }
      .martingale-dots-container { display: flex; justify-content: center; align-items: center; margin-top: 6px; gap: 3px; flex-wrap: wrap; }
      
      .martingale-dot {
        height: 22px; width: 22px; background-color: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 50%;
        display: inline-flex; align-items: center; justify-content: center;
        font-size: 9px; font-weight: 600; color: rgba(255, 255, 255, 0.7);
      }
      .martingale-dot.virtual-white { background-color: rgba(255, 255, 255, 0.25); border-color: #fff; color: #fff; box-shadow: 0 0 6px rgba(255,255,255,0.4); }
      .martingale-dot.virtual-loss { background-color: rgba(239, 68, 68, 0.2); border-color: rgba(239, 68, 68, 0.4); color: #f87171; }
      .martingale-dot.active { background-color: rgba(234, 179, 8, 0.3); border-color: rgba(234, 179, 8, 0.6); color: #facc15; animation: blink 0.8s infinite; }
      .martingale-dot.loss { background-color: rgba(239, 68, 68, 0.25); border-color: rgba(239, 68, 68, 0.5); color: #f87171; } 
      
      #tenStepPatternDisplay .pattern-highlight {
          display: inline-block;
          color: #ffffff;
          font-weight: 800;
          text-shadow: 0 0 8px #ffffff, 0 0 14px #00ffcc, 0 0 22px #00ffcc;
          background: rgba(255, 255, 255, 0.12);
          padding: 2px 8px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.6);
          margin: 0 2px;
          transform: scale(1.08);
          animation: patternPulse 1.2s infinite;
      }
      @keyframes patternPulse {
          0%, 100% { box-shadow: 0 0 6px rgba(255,255,255,0.5); }
          50% { box-shadow: 0 0 14px rgba(255,255,255,0.9), 0 0 24px rgba(0,255,204,0.6); }
      }
      
      /* 🆕 Countdown timer এর স্টাইল */
      #countdownBox {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 4px;
          padding: 10px 8px;
          background: rgba(34, 211, 238, 0.08);
          border: 1px solid rgba(34, 211, 238, 0.25);
          border-radius: 14px;
          margin-bottom: 10px;
      }
      #countdownBox .cd-digit {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 26px;
          height: 34px;
          padding: 0 6px;
          background: rgba(0, 0, 0, 0.45);
          border: 1px solid rgba(34, 211, 238, 0.4);
          border-radius: 8px;
          color: #22d3ee;
          font-size: 18px;
          font-weight: 700;
          font-family: 'Courier New', monospace;
          text-shadow: 0 0 8px rgba(34, 211, 238, 0.8);
          box-shadow: inset 0 0 8px rgba(34, 211, 238, 0.15);
      }
      #countdownBox .cd-colon {
          color: #22d3ee;
          font-size: 18px;
          font-weight: 700;
          padding: 0 2px;
          text-shadow: 0 0 8px rgba(34, 211, 238, 0.8);
      }
      #countdownBox.cd-urgent .cd-digit {
          color: #f87171;
          border-color: rgba(239, 68, 68, 0.5);
          text-shadow: 0 0 10px rgba(239, 68, 68, 0.9);
          animation: blink 0.6s infinite;
      }
      #countdownBox.cd-urgent .cd-colon {
          color: #f87171;
          text-shadow: 0 0 10px rgba(239, 68, 68, 0.9);
      }
    </style>
    
    <div class="drag-handle">
      N4X0R SMART 1/50 JUMP BOT
      <button id="closeBtn">✕</button>
    </div>
    
    <div id="statusMsg" style="text-align:center; font-size:13px; color:#34d399; margin-bottom:10px; padding:6px; background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.2); border-radius:8px; display:none;"></div>
    
    <div class="hacker-section" style="display: flex; gap: 8px; align-items: center; justify-content: space-between;">
      <div style="flex: 1;">
        <select id="virtualStepSelect" style="width: 100%; padding: 6px;">
          ${virtualOptionsHtml}
        </select>
      </div>
      <div style="flex: 1;">
        <select id="realStepSelect" style="width: 100%; padding: 6px;">
          ${realOptionsHtml}
        </select>
      </div>
      <div style="flex: 1;">
        <select id="historyPageSelect" style="width: 100%; padding: 6px; color: #facc15; font-weight: bold;">
          ${pageOptionsHtml}
        </select>
      </div>
    </div>

    <!-- 🆕 BIG/SMALL বাটনের জায়গায় Count Down Timer -->
    <div id="countdownBox">
      <div class="cd-digit" id="cdDigit1">0</div>
      <div class="cd-digit" id="cdDigit2">0</div>
      <div class="cd-colon">:</div>
      <div class="cd-digit" id="cdDigit3">0</div>
      <div class="cd-digit" id="cdDigit4">0</div>
    </div>

    <div class="hacker-section">
      <div class="hacker-section-title">LOCKED PATTERN VIEW</div>
      <div id="tenStepPatternDisplay" style="color: #00ffcc; font-size: 13px; text-align: center; word-break: break-all; font-weight: 600;">লোড হচ্ছে...</div>
    </div>

    <div class="hacker-section">
      <div class="hacker-section-title">PERIOD: <span id="currentPeriodDisplay" style="color:#22d3ee;">—</span></div>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; flex-direction: column; gap: 4px; font-size: 13px;">
          <div>BALANCE: <span id="currentBalance" class="blink-text" style="color: #fff; font-weight: 600;">LOADING...</span></div>
          <div>NEXT BET: <span id="currentAmt" style="color: #34d399; font-weight: 600;">1</span></div>
          <div>EXPECTED: <span id="runningResult" style="color:#facc15; font-weight: 600;">—</span></div>
          <div>MODE: <span id="currentCondition" style="color:#ffffff; font-weight: 600;">Virtual (Seq Locked)</span></div>
        </div>
        <div style="font-size:22px; font-weight:700; text-align:center; color:#34d399; background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.2); padding:8px 12px; border-radius:12px;">
          <span id="bigProfitDisplay">0</span>
        </div>
      </div>
      <div style="height: 1px; background: rgba(255, 255, 255, 0.08); margin: 10px 0;"></div>
      <div style="text-align:center;">
        <div id="martingaleStepsContainer" class="martingale-dots-container">
          ${generateMartingaleDots(maxMartingaleSteps)}
        </div>
      </div>
    </div>

    <div style="text-align:center; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
        <button id="startBtn" style="flex: 1; font-weight: 600;">Start Bot</button>
        <button id="stopBtn" style="flex: 1; font-weight: 600;" disabled>Stop</button>
        <select id="profitLimit" style="flex: 1; padding: 8px; font-size: 13px;">
            <option value="0">Limit</option>
            ${Array.from({ length: 50 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}
        </select>
    </div>
  `;
  document.body.appendChild(dashboard);

  const overlay = document.createElement("div");
  overlay.id = "screenOverlay";
  overlay.style = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: transparent; z-index: 999998; pointer-events: none; transition: background 0.6s ease;`;
  document.body.appendChild(overlay);

  function setOverlayColor(color) {
    overlay.style.background = color;
    setTimeout(() => { overlay.style.background = "transparent"; }, 1200);
  }

  const statusMsg = dashboard.querySelector("#statusMsg");
  const runningResult = dashboard.querySelector("#runningResult");
  const martingaleStepsContainer = dashboard.querySelector("#martingaleStepsContainer");
  const currentAmtEl = dashboard.querySelector("#currentAmt");
  const bigProfitDisplay = dashboard.querySelector("#bigProfitDisplay");
  const startBtn = dashboard.querySelector("#startBtn");
  const stopBtn = dashboard.querySelector("#stopBtn");
  const closeBtn = dashboard.querySelector("#closeBtn");
  const currentBalanceEl = dashboard.querySelector("#currentBalance");
  const profitLimitSelect = dashboard.querySelector("#profitLimit");
  const currentConditionEl = dashboard.querySelector("#currentCondition");
  const currentPeriodDisplay = dashboard.querySelector("#currentPeriodDisplay");
  const tenStepPatternDisplay = dashboard.querySelector("#tenStepPatternDisplay");
  const virtualStepSelect = dashboard.querySelector("#virtualStepSelect");
  const realStepSelect = dashboard.querySelector("#realStepSelect");
  const historyPageSelect = dashboard.querySelector("#historyPageSelect");
  const vCountLabel = dashboard.querySelector("#vCountLabel");
  const rCountLabel = dashboard.querySelector("#rCountLabel");
  
  // 🆕 countdown elements
  const countdownBox = dashboard.querySelector("#countdownBox");
  const cdDigit1 = dashboard.querySelector("#cdDigit1");
  const cdDigit2 = dashboard.querySelector("#cdDigit2");
  const cdDigit3 = dashboard.querySelector("#cdDigit3");
  const cdDigit4 = dashboard.querySelector("#cdDigit4");

  closeBtn.addEventListener("mousedown", (e) => {
      e.stopPropagation();
  });
  closeBtn.addEventListener("touchstart", (e) => {
      e.stopPropagation();
  }, { passive: true });
  closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      clearInterval(intervalId);
      intervalId = null;
      if (countdownIntervalId) {
          clearInterval(countdownIntervalId);
          countdownIntervalId = null;
      }
      dashboard.remove();
      overlay.remove();
  });

  function showStatus(message) {
    statusMsg.textContent = message;
    statusMsg.style.display = "block";
    setTimeout(() => { statusMsg.style.display = "none"; }, 2000);
  }

  virtualStepSelect.addEventListener("change", (e) => {
      virtualStepsConfig = parseInt(e.target.value);
      maxMartingaleSteps = virtualStepsConfig + realStepsConfig;
      redrawMartingaleDots();
  });

  realStepSelect.addEventListener("change", (e) => {
      realStepsConfig = parseInt(e.target.value);
      maxMartingaleSteps = virtualStepsConfig + realStepsConfig;
      redrawMartingaleDots();
  });

  historyPageSelect.addEventListener("change", (e) => {
      targetHistoryPage = parseInt(e.target.value);
      showStatus(`Target Pattern Page set to: ${targetHistoryPage}/50`);
  });

  function updateMartingaleDots() {
    const martingaleDots = dashboard.querySelectorAll(".martingale-dot");
    martingaleDots.forEach((dot, idx) => {
      const dotIndex = idx + 1; 
      dot.classList.remove("active", "loss", "virtual-white", "virtual-loss");
      
      if (!isRealTradeActive) {
          if (dotIndex <= virtualStepsConfig) {
              if (dotIndex < consecutiveLossCount + 1) {
                  dot.classList.add("virtual-loss"); 
              } else if (dotIndex === consecutiveLossCount + 1) {
                  dot.classList.add("active"); 
              } else {
                  dot.classList.add("virtual-white"); 
              }
          }
      } else {
          if (dotIndex <= virtualStepsConfig) {
              dot.classList.add("virtual-loss"); 
          } else {
              let realStepNumber = dotIndex - virtualStepsConfig; 
              if (realStepNumber === martingaleStep + 1) {
                  dot.classList.add("active"); 
              } else if (realStepNumber < martingaleStep + 1) {
                  dot.classList.add("loss"); 
              }
          }
      }
    });
  }

  function redrawMartingaleDots() {
    maxMartingaleSteps = virtualStepsConfig + realStepsConfig;
    martingaleStepsContainer.innerHTML = generateMartingaleDots(maxMartingaleSteps);
    updateMartingaleDots();
  }
  
  // 🆕 Countdown আপডেট করার ফাংশন
  function updateCountdownDisplay() {
      if (!countdownBox || !cdDigit1 || !cdDigit2 || !cdDigit3 || !cdDigit4) return;
      
      const timeLeftEl = document.querySelector('.TimeLeft__C-time');
      if (!timeLeftEl) {
          cdDigit1.textContent = "0";
          cdDigit2.textContent = "0";
          cdDigit3.textContent = "0";
          cdDigit4.textContent = "0";
          countdownBox.classList.remove("cd-urgent");
          return;
      }
      
      const digitDivs = timeLeftEl.querySelectorAll("div");
      let digitsOnly = [];
      let hasColon = false;
      
      digitDivs.forEach((div) => {
          const txt = div.textContent.trim();
          if (txt === ":") {
              hasColon = true;
          } else if (txt.length > 0 && /^[0-9]+$/.test(txt)) {
              digitsOnly.push(txt);
          }
      });
      
      // সাইট থেকে ডিজিট এক্সট্রাক্ট করি
      let seconds = 0, minutes = 0, hours = 0;
      
      if (digitsOnly.length === 4) {
          // HH:MM:SS format
          hours = parseInt(digitsOnly[0]) * 10 + parseInt(digitsOnly[1]);
          minutes = parseInt(digitsOnly[2]);
          seconds = parseInt(digitsOnly[3]);
      } else if (digitsOnly.length === 3) {
          // H:MM:SS বা MM:SS ধরনের
          if (hasColon) {
              // এটা MM:SS বা H:MM:SS হতে পারে - দেখি কতগুলো colon আছে
              minutes = parseInt(digitsOnly[0]) * 10 + parseInt(digitsOnly[1]);
              seconds = parseInt(digitsOnly[2]);
          }
      } else if (digitsOnly.length === 2) {
          // MM:SS এর single digit variants
          minutes = parseInt(digitsOnly[0]);
          seconds = parseInt(digitsOnly[1]);
      } else if (digitsOnly.length === 1) {
          seconds = parseInt(digitsOnly[0]);
      }
      
      // যদি 4 digit আকারে সাইটে থাকে যেভাবে আপনার উদাহরণে ছিল: 0 0 : 1 7
      // তাহলে সেটাকে সরাসরি প্রথম দুইটা = minute digit, পরের দুইটা = second digit
      if (digitsOnly.length === 4 && hasColon) {
          // উদাহরণ: "0","0",":","1","7" → minutes=00, seconds=17
          // অথবা "1","2",":","3","4" → minutes=12, seconds=34
          // এই ক্ষেত্রে ৪ ডিজিট মানে MM:SS নয়, বরং M M : S S
          // তাই আমরা সরাসরি ডিজিট ম্যাপ করি
          cdDigit1.textContent = digitsOnly[0];
          cdDigit2.textContent = digitsOnly[1];
          cdDigit3.textContent = digitsOnly[2];
          cdDigit4.textContent = digitsOnly[3];
          
          // urgent check: total seconds
          const totalSec = (parseInt(digitsOnly[0]) * 10 + parseInt(digitsOnly[1])) * 60 + 
                           (parseInt(digitsOnly[2]) * 10 + parseInt(digitsOnly[3]));
          if (totalSec <= 10) {
              countdownBox.classList.add("cd-urgent");
          } else {
              countdownBox.classList.remove("cd-urgent");
          }
          return;
      }
      
      // fallback: digitsOnly.length অনুযায়ী ডিসপ্লে
      if (digitsOnly.length >= 4) {
          cdDigit1.textContent = digitsOnly[0];
          cdDigit2.textContent = digitsOnly[1];
          cdDigit3.textContent = digitsOnly[2];
          cdDigit4.textContent = digitsOnly[3];
      } else if (digitsOnly.length === 3) {
          cdDigit1.textContent = "0";
          cdDigit2.textContent = digitsOnly[0];
          cdDigit3.textContent = digitsOnly[1];
          cdDigit4.textContent = digitsOnly[2];
      } else if (digitsOnly.length === 2) {
          cdDigit1.textContent = "0";
          cdDigit2.textContent = "0";
          cdDigit3.textContent = digitsOnly[0];
          cdDigit4.textContent = digitsOnly[1];
      } else if (digitsOnly.length === 1) {
          cdDigit1.textContent = "0";
          cdDigit2.textContent = "0";
          cdDigit3.textContent = "0";
          cdDigit4.textContent = digitsOnly[0];
      } else {
          cdDigit1.textContent = "0";
          cdDigit2.textContent = "0";
          cdDigit3.textContent = "0";
          cdDigit4.textContent = "0";
      }
      
      // urgent check - কম সময় বাকি থাকলে লাল করা
      const totalSec = (parseInt(cdDigit1.textContent) * 10 + parseInt(cdDigit2.textContent)) * 60 + 
                       (parseInt(cdDigit3.textContent) * 10 + parseInt(cdDigit4.textContent));
      if (totalSec <= 10 && totalSec > 0) {
          countdownBox.classList.add("cd-urgent");
      } else {
          countdownBox.classList.remove("cd-urgent");
      }
  }
  
  // 🆕 countdown interval চালু করি (প্রতি ২০০ms এ আপডেট)
  if (countdownIntervalId) clearInterval(countdownIntervalId);
  countdownIntervalId = setInterval(updateCountdownDisplay, 200);
  updateCountdownDisplay();
  
  // Drag & Drop এ background scroll বন্ধ
  const dragHandle = dashboard.querySelector(".drag-handle");
  let isDragging = false, offsetX = 0, offsetY = 0;
  let originalBodyOverflow = '';
  let originalBodyTouchAction = '';
  
  const startDrag = (e) => {
    if (e.target && (e.target.id === 'closeBtn' || e.target.closest('#closeBtn'))) {
        return;
    }
    
    isDragging = true;
    
    originalBodyOverflow = document.body.style.overflow;
    originalBodyTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    
    const evt = e.touches ? e.touches[0] : e;
    offsetX = evt.clientX - dashboard.offsetLeft;
    offsetY = evt.clientY - dashboard.offsetTop;
    
    if (e.cancelable) e.preventDefault();
  };
  
  const doDrag = (e) => {
    if (!isDragging) return;
    if (e.cancelable) e.preventDefault();
    
    const evt = e.touches ? e.touches[0] : e;
    dashboard.style.left = `${evt.clientX - offsetX}px`;
    dashboard.style.top = `${evt.clientY - offsetY}px`;
  };
  
  const stopDrag = () => {
    if (!isDragging) return;
    isDragging = false;
    
    document.body.style.overflow = originalBodyOverflow;
    document.body.style.touchAction = originalBodyTouchAction;
  };
  
  dragHandle.addEventListener("mousedown", startDrag);
  dragHandle.addEventListener("touchstart", startDrag, { passive: false });
  document.addEventListener("mousemove", doDrag);
  document.addEventListener("touchmove", doDrag, { passive: false });
  document.addEventListener("mouseup", stopDrag);
  document.addEventListener("touchend", stopDrag);
  document.addEventListener("touchcancel", stopDrag);
  
  profitLimitSelect.addEventListener("change", (event) => {
      const value = parseInt(event.target.value);
      customProfitLimit = value === 0 ? null : value;
      showStatus(`Profit Limit set to: ${customProfitLimit === null ? 'No Limit' : customProfitLimit}`);
  });

  function getCurrentPageNumber() {
      let allElements = document.querySelectorAll('*');
      for (let el of allElements) {
          if (el.children.length === 0 && el.textContent.includes('/50')) {
              let parts = el.textContent.trim().split('/');
              let p = parseInt(parts[0]);
              if (!isNaN(p) && p > 0 && p <= 50) {
                  return p;
              }
          }
      }
      return 1;
  }

  function getPageDataSnapshot() {
      const rows = Array.from(document.querySelectorAll(".van-row"));
      let snapshot = "";
      let firstPeriod = null;
      for (let i = 0; i < rows.length && i < 10; i++) {
          const periodCol = rows[i].querySelector(".van-col--10");
          const bigSmallSpan = rows[i].querySelector('.van-col:nth-child(3) span');
          const periodText = periodCol ? periodCol.textContent.trim() : "";
          const resultText = bigSmallSpan ? bigSmallSpan.textContent.trim() : "";
          if (i === 0) firstPeriod = periodText;
          snapshot += `${periodText}|${resultText}||`;
      }
      return { snapshot, firstPeriod };
  }

  function navigateToTargetPageAndWaitForFreshData(callback) {
      navigateToPage(targetHistoryPage, () => {
          let retries = 0;
          
          function checkFreshData() {
              const currentPage = getCurrentPageNumber();
              const rows = document.querySelectorAll(".van-row");
              
              if (currentPage !== targetHistoryPage || rows.length === 0) {
                  retries++;
                  if (retries >= MAX_TARGET_PAGE_RETRIES) {
                      showStatus(`⚠ Target page ${targetHistoryPage} load failed, using whatever available`);
                      if (typeof callback === 'function') callback();
                      return;
                  }
                  setTimeout(checkFreshData, 80);
                  return;
              }
              
              const { snapshot, firstPeriod } = getPageDataSnapshot();
              const firstResultSpan = rows[0]?.querySelector('.van-col:nth-child(3) span');
              const firstResultText = firstResultSpan ? firstResultSpan.textContent.trim() : "";
              
              const isValidData = firstPeriod && 
                                  firstPeriod.length > 5 && 
                                  (firstResultText === "Big" || firstResultText === "Small");
              
              if (!isValidData) {
                  retries++;
                  if (retries >= MAX_TARGET_PAGE_RETRIES) {
                      showStatus(`⚠ Data on page ${targetHistoryPage} not fresh after ${MAX_TARGET_PAGE_RETRIES} retries`);
                      if (typeof callback === 'function') callback();
                      return;
                  }
                  setTimeout(checkFreshData, 80);
                  return;
              }
              
              if (typeof callback === 'function') callback();
          }
          
          setTimeout(checkFreshData, 60);
      });
  }

  function fetchLockedPatternFromTargetPage() {
      return new Promise((resolve) => {
          navigateToTargetPageAndWaitForFreshData(() => {
              let results = fetchSitePatternResults();
              if (results.length >= 5) {
                  lockedPatternArray = [...results];
                  isPatternLocked = true;
                  updateTenStepPatternView(lockedPatternArray);
                  resolve(true);
              } else {
                  showStatus(`⚠ Target page ${targetHistoryPage} returned only ${results.length} results`);
                  resolve(false);
              }
          });
      });
  }

  function navigateToPage(pageNumber, callback) {
      let maxLoops = 60;
      let loopCount = 0;

      function stepNav() {
          let currentPage = getCurrentPageNumber();
          let rows = document.querySelectorAll(".van-row");

          if (currentPage === pageNumber && rows.length > 0) {
              let firstResultCheck = rows[0].querySelector('.van-col:nth-child(3) span');
              if (firstResultCheck && firstResultCheck.textContent.trim().length > 0) {
                  setTimeout(() => {
                      if (typeof callback === 'function') callback();
                  }, 40);
                  return;
              }
          }

          if (loopCount > maxLoops) {
              if (typeof callback === 'function') callback();
              return;
          }
          loopCount++;

          let nextBtn = document.querySelector('.record-foot-next');
          if (pageNumber === 1 && currentPage > 1) {
              let pageOneBtn = Array.from(document.querySelectorAll('*')).find(el => el.children.length === 0 && el.textContent.trim() === '1');
              if (pageOneBtn) {
                  pageOneBtn.click();
              } else {
                  if (typeof callback === 'function') callback();
                  return;
              }
          } else if (currentPage < pageNumber && nextBtn) {
              nextBtn.click();
          } else {
              setTimeout(stepNav, 40);
              return;
          }

          setTimeout(stepNav, 40);
      }

      stepNav();
  }

  function fetchSitePatternResults() {
    const rows = Array.from(document.querySelectorAll(".van-row"));
    let results = [];
    for (let i = 0; i < rows.length && results.length < 10; i++) {
        let bigSmallSpan = rows[i].querySelector('.van-col:nth-child(3) span');
        if (bigSmallSpan) {
            let val = bigSmallSpan.innerText.trim();
            if (val.toLowerCase() === "big" || val === "Big") {
                results.push("Big");
            } else if (val.toLowerCase() === "small" || val === "Small") {
                results.push("Small");
            }
        }
    }
    return results.reverse();
  }

  function updateTenStepPatternView(results, highlightExpected = null) {
    if (!tenStepPatternDisplay) return;
    
    if (!results || results.length === 0) {
        tenStepPatternDisplay.textContent = "ডেটা পাওয়া যায়নি";
        return;
    }
    
    let highlightValue = highlightExpected;
    if (highlightValue === null && awaitingResult && expectedResult) {
        highlightValue = expectedResult;
    }
    
    let highlightIndex = -1;
    if (highlightValue !== null) {
        let candidateIndex = patternIndexPointer - 1;
        if (candidateIndex >= 0 && candidateIndex < results.length) {
            if (results[candidateIndex] === highlightValue) {
                highlightIndex = candidateIndex;
            }
        }
        if (highlightIndex === -1) {
            for (let i = 0; i < results.length; i++) {
                if (results[i] === highlightValue) {
                    highlightIndex = i;
                    break;
                }
            }
        }
    }
    
    highlightedPatternIndex = highlightIndex;
    
    let htmlParts = [];
    for (let i = 0; i < results.length; i++) {
        if (i === highlightIndex) {
            htmlParts.push(`<span class="pattern-highlight">${results[i]}</span>`);
        } else {
            htmlParts.push(`<span>${results[i]}</span>`);
        }
    }
    
    tenStepPatternDisplay.innerHTML = htmlParts.join(' - ');
  }

  function processNewCandleCheck(onComplete) {
      navigateToPage(1, () => {
          const results1 = fetchSitePatternResults();
          if (typeof onComplete === 'function') {
              onComplete(results1);
          }
      });
  }

  function refreshStrategyForCurrentBalance(forceUpdate = false) {
    const balance = updateBalanceDisplay();
    
    if (!forceUpdate && lockedCycleBets.length > 0) {
      currentStrategyBets = lockedCycleBets;
      if (currentStrategyBets.length > martingaleStep) {
        currentAmount = currentStrategyBets[martingaleStep];
      } else {
        currentAmount = currentStrategyBets[currentStrategyBets.length - 1];
      }
      currentAmtEl.textContent = `৳${currentAmount.toFixed(2)}`;
      updateMartingaleDots();
      return;
    }

    if (balance > 0) {
      let firstBetCandidate = computeFirstBetFromBalance(balance, payout, realStepsConfig);
      if (firstBetCandidate <= 0) firstBetCandidate = 1;
      
      const compliantResult = getRiskCompliantCycle(balance, firstBetCandidate, payout, realStepsConfig);
      currentStrategyBets = compliantResult.bets;
      lockedCycleBets = [...currentStrategyBets]; 
      
      if (currentStrategyBets.length > martingaleStep) {
        currentAmount = currentStrategyBets[martingaleStep];
      } else {
        currentAmount = currentStrategyBets[0];
        martingaleStep = 0;
      }
      currentAmtEl.textContent = `৳${currentAmount.toFixed(2)}`;
    } else {
      currentBalanceEl.textContent = "Not Found";
      currentAmtEl.textContent = "1";
      currentAmount = 1;
    }
    updateMartingaleDots();
  }

  function resetToNewBalance() {
    martingaleStep = 0;
    refreshStrategyForCurrentBalance(true); 
  }

  function updateBalanceDisplay() {
    const balanceElement = document.querySelector(".Wallet__C-balance-l1");
    if (balanceElement && balanceElement.textContent) {
      const balanceText = balanceElement.textContent.trim().replace(/[,৳]/g, '');
      const balance = parseFloat(balanceText);
      currentBalanceEl.textContent = `৳${balance.toFixed(2)}`;
      return balance;
    } else {
      currentBalanceEl.textContent = "Not Found";
      return 0;
    }
  }

  function updateInputAmount() {
    const input = document.querySelector('input[type="number"]');
    if (input) {
      currentAmtEl.textContent = `৳${currentAmount.toFixed(2)}`;
      const integerAmount = Math.floor(currentAmount);
      input.value = integerAmount > 0 ? integerAmount : 1;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  
  function animateProfit() { setOverlayColor("rgba(16, 185, 129, 0.15)"); }
  function animateLoss() { 
    setOverlayColor("rgba(239, 68, 68, 0.1)");
    dashboard.style.animation = "shake 0.5s";
    setTimeout(() => dashboard.style.animation = "", 500);
  }

  function placeRealTrade(result) {
    if (isPlacingTrade) return;
    isPlacingTrade = true; 
    
    refreshStrategyForCurrentBalance(false); 
    updateInputAmount(); 
    
    const buttonSelector = result === "Big" ? ".Betting__C-foot-b" : ".Betting__C-foot-s";
    const button = document.querySelector(buttonSelector);
    
    let realLightNumber = virtualStepsConfig + 1 + martingaleStep;
    
    if (button) {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      expectedResult = result;
      runningResult.textContent = `${result.toUpperCase()} (Real Step ${martingaleStep + 1} / Light ${realLightNumber})`;
      awaitingResult = true;
      updateTenStepPatternView(lockedPatternArray, expectedResult);
      updateMartingaleDots(); 

      let checkCount = 0;
      const checkPopup = setInterval(() => {
          const popupInput = document.querySelector('.van-popup input[type="number"]');
          const confirmBtn = document.querySelector('.van-popup .bet-amount');
          
          if (popupInput && confirmBtn) {
            clearInterval(checkPopup);
            const integerAmount = Math.floor(currentAmount);
            popupInput.value = integerAmount > 0 ? integerAmount : 1;
            popupInput.dispatchEvent(new Event("input", { bubbles: true }));
            confirmBtn.click();
            isPlacingTrade = false; 
          }
          checkCount++;
          if (checkCount >= 10) {
              clearInterval(checkPopup);
              isPlacingTrade = false; 
          }
      }, 100);
    } else {
      isPlacingTrade = false;
      showStatus("⚠ Site bet button not found!");
    }
  }

  function getLatestCandle() {
    if (getCurrentPageNumber() !== 1) return null;

    const rows = Array.from(document.querySelectorAll(".van-row"));
    for (const row of rows) {
      const periodCol = row.querySelector(".van-col--10");
      const spanEl = row.querySelector("span");
      if (periodCol && spanEl) {
        const period = periodCol.textContent.trim();
        const result = spanEl.textContent.trim();
        if ((result === "Big" || result === "Small") && period.length > 5) {
          return { result: result, period: period };
        }
      }
    }
    return null;
  }
  
  function stopBot(reason = "manually") {
    clearInterval(intervalId);
    intervalId = null;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    isBotRunning = false;
    consecutiveLossCount = 0;
    isRealTradeActive = false;
    lockedPatternArray = [];
    isPatternLocked = false;
    patternIndexPointer = 0;
    lockedCycleBets = [];
    highlightedPatternIndex = -1;
    
    bigProfitDisplay.textContent = `${profitCount}`;
    
    const winMessage = `Total Wins: ${profitCount}`;
    if (reason === "loss") showStatus(`⚠ Max Loss Reached! ${winMessage}`);
    else if (reason === "profit") showStatus(`🎉✔ Profit Limit Reached! ${winMessage}`);
    else showStatus(`Bot Stopped! ${winMessage}`);
    resetToNewBalance(); 
  }

  // 🆕 manualBigBtn ও manualSmallBtn রিমুভ করা হয়েছে, তাই এই handler গুলোও রিমুভ
  // (এখন countdown দেখানো হবে)

  function update() {
    if (!intervalId) return;
    
    updateBalanceDisplay();
    const latest = getLatestCandle();
    
    if (latest) currentPeriodDisplay.textContent = latest.period;
    
    if (awaitingResult && latest && latest.period !== lastTradedPeriod) {
        awaitingResult = false;
        
        let firstRealLight = virtualStepsConfig + 1;

        processNewCandleCheck((results1) => {
            let latestResultFrom1 = null;
            
            const rows = Array.from(document.querySelectorAll(".van-row"));
            for (const row of rows) {
                const periodCol = row.querySelector(".van-col--10");
                const spanEl = row.querySelector("span");
                if (periodCol && spanEl) {
                    const rowPeriod = periodCol.textContent.trim();
                    const rowResult = spanEl.textContent.trim();
                    if (rowPeriod === latest.period && (rowResult === "Big" || rowResult === "Small")) {
                        latestResultFrom1 = rowResult;
                        break;
                    }
                }
            }
            
            if (!latestResultFrom1) {
                latestResultFrom1 = latest.result;
            }
            
            let didWin = (latestResultFrom1 === expectedResult);
            lastTradedPeriod = latest.period;
            
            let wasRealTrade = isRealTradeActive;

            if (didWin) {
                if (wasRealTrade) {
                    profitCount++;
                    bigProfitDisplay.textContent = `${profitCount}`;
                }
                
                consecutiveLossCount = 0; 
                isRealTradeActive = false; 
                martingaleStep = 0;
                animateProfit();
                resetToNewBalance(); 
                
                if (wasRealTrade && customProfitLimit !== null && profitCount >= customProfitLimit) {
                    bigProfitDisplay.textContent = `${profitCount}`;
                    stopBot("profit");
                    return;
                }
                
                if (wasRealTrade) {
                    showStatus(`✔ REAL WIN! (Profit: ${profitCount}) Fetching fresh pattern from page ${targetHistoryPage}.`);
                } else {
                    showStatus(`✔ Virtual WIN! (No profit count) Fetching fresh pattern from page ${targetHistoryPage}.`);
                }

                fetchLockedPatternFromTargetPage().then(() => {
                    patternIndexPointer = 0;
                    let nextPred = lockedPatternArray[patternIndexPointer] || "Big";
                    patternIndexPointer++;

                    navigateToPage(1, () => {
                        expectedResult = nextPred;
                        awaitingResult = true;
                        runningResult.textContent = `${nextPred.toUpperCase()} (Virtual Test)`;
                        currentConditionEl.textContent = `Virtual (Win Reset, New Pattern Locked)`;
                        currentConditionEl.style.color = "#ffffff";
                        updateTenStepPatternView(lockedPatternArray, expectedResult);
                        updateMartingaleDots();
                    });
                });

            } else {
                if (!isRealTradeActive) {
                    consecutiveLossCount++;
                    animateLoss();
                    showStatus(`Virtual Loss #${consecutiveLossCount}/${virtualStepsConfig} (Using locked sequence)`);

                    if (consecutiveLossCount >= virtualStepsConfig) {
                        isRealTradeActive = true;
                        martingaleStep = 0; 
                        refreshStrategyForCurrentBalance(false); 
                        currentConditionEl.textContent = `Real Step 1 (Light ${firstRealLight})`;
                        currentConditionEl.style.color = "#34d399";
                        showStatus(`⚠ Virtual limit reached! Moving to REAL MONEY.`);
                    } else {
                        currentConditionEl.textContent = `Virtual Mode (Losses: ${consecutiveLossCount}/${virtualStepsConfig})`;
                        currentConditionEl.style.color = "#ffffff";
                    }
                } else {
                    martingaleStep++; 
                    animateLoss();
                    
                    if (martingaleStep >= realStepsConfig) { 
                        martingaleStep = 0;
                        stopBot("loss");
                        return;
                    } else {
                        refreshStrategyForCurrentBalance(false); 
                        let currentRealLight = virtualStepsConfig + 1 + martingaleStep;
                        currentConditionEl.textContent = `Real Step ${martingaleStep + 1} (Light ${currentRealLight})`;
                        currentConditionEl.style.color = "#34d399";
                        showStatus(`✘ Real Loss! Continuing locked sequence.`);
                    }
                }
                updateMartingaleDots();

                if (patternIndexPointer >= lockedPatternArray.length) {
                    patternIndexPointer = 0;
                }
                let nextPred = lockedPatternArray[patternIndexPointer] || "Big";
                patternIndexPointer++;

                if (isRealTradeActive) {
                    placeRealTrade(nextPred);
                } else {
                    expectedResult = nextPred;
                    awaitingResult = true;
                    runningResult.textContent = `${nextPred.toUpperCase()} (Virtual Test)`;
                    updateTenStepPatternView(lockedPatternArray, expectedResult);
                    updateMartingaleDots();
                    showStatus(`Virtual Testing: Expecting ${nextPred} from locked sequence`);
                }
            }
        });
    }
  }

  startBtn.onclick = () => {
    if (!intervalId) {
      startBtn.disabled = true;
      stopBtn.disabled = false;
      isBotRunning = true;

      martingaleStep = 0;
      profitCount = 0;
      consecutiveLossCount = 0;
      isRealTradeActive = false; 
      lockedPatternArray = [];
      isPatternLocked = false;
      patternIndexPointer = 0;
      highlightedPatternIndex = -1;
      bigProfitDisplay.textContent = `${profitCount}`;
      redrawMartingaleDots();
      resetToNewBalance(); 
      
      fetchLockedPatternFromTargetPage().then((success) => {
          let firstPred = lockedPatternArray[patternIndexPointer] || "Big";
          patternIndexPointer++;
          expectedResult = firstPred;
          awaitingResult = true;
          runningResult.textContent = `${firstPred.toUpperCase()} (Virtual Test)`;
          currentConditionEl.textContent = `Virtual Mode (Target Page ${targetHistoryPage} Active)`;
          currentConditionEl.style.color = "#ffffff";
          updateTenStepPatternView(lockedPatternArray, expectedResult);
          updateMartingaleDots();
          
          showStatus(`✔ Pattern Locked! Virtual Entry placed on current candle (${firstPred}).`);
          
          navigateToPage(1, () => {
              const initialCandle = getLatestCandle();
              if (initialCandle) {
                lastTradedPeriod = initialCandle.period;
                currentPeriodDisplay.textContent = initialCandle.period;
              }
              
              intervalId = setInterval(update, 700);
              
              showStatus(`✔ Bot Running! Waiting next candle for result.`);
          });
      });
    }
  };

  stopBtn.onclick = () => { stopBot(); };
  
  redrawMartingaleDots();
  resetToNewBalance(); 
  
  fetchLockedPatternFromTargetPage().then(() => {
      // ডাটা লোড শেষ
  });

  if ('wakeLock' in navigator) {
    try { navigator.wakeLock.request('screen'); } catch (err) {}
  }
})()
