Javascript:(function () {
  // --- FIREBASE LICENSE VERIFICATION ---
  const firebaseConfig = {
    apiKey: "AIzaSyBwzU85bZlAbt4T3BlpvIR7hY__EDTiAYk",
    authDomain: "messenger-281ba.firebaseapp.com",
    databaseURL: "https://messenger-281ba-default-rtdb.firebaseio.com",
    projectId: "messenger-281ba",
    storageBucket: "messenger-281ba.firebasestorage.app",
    messagingSenderId: "800470581108",
    appId: "1:800470581108:web:8a580f6bfb50c8c25d3621",
    measurementId: "G-0LRM3BXNRV"
  };

  function loadScript(url, callback) {
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = url;
    script.onload = callback;
    document.head.appendChild(script);
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return "Just now";
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "1min ago";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}min ago`;
    const hours = Math.floor(minutes / 60);
    const remMins = minutes % 60;
    if (hours < 24) {
      return remMins > 0 ? `${hours}hr ${remMins}min ago` : `${hours}hr ago`;
    }
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days} day ${remHours}hr ${remMins}min ago`;
  }

  // --- PERSISTENT FIXED USER ID GENERATOR (6 chars: Number + Uppercase) ---
  let fixedUserId = localStorage.getItem("n4xor_fixed_user_id");
  if (!fixedUserId) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let generated = "";
    for (let i = 0; i < 6; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    fixedUserId = generated;
    localStorage.setItem("n4xor_fixed_user_id", fixedUserId);
  }

  // Generate unique device ID if not exists
  let deviceId = localStorage.getItem("n4xor_device_id");
  if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    localStorage.setItem("n4xor_device_id", deviceId);
  }

  function initAppWithLicense(key) {
    const db = firebase.database();
    const licenseRef = db.ref("licenses/" + key);
    
    licenseRef.on("value", (snapshot) => {
      const data = snapshot.val();
      
      if (!data || data.status === "blocked" || (data.expiryDate && Date.now() > data.expiryDate)) {
        localStorage.removeItem("n4xor_active_license");
        let isBlockedMsg = data && data.status === "blocked";
        showLicenseModal(true, fixedUserId, isBlockedMsg);
        return;
      }

      // --- SAME LICENSE MULTI-USER RESTRICTION CHECK ---
      if (data && data.users) {
        const deviceKeys = Object.keys(data.users);
        const activeDevices = deviceKeys.filter(devId => {
          const devObj = data.users[devId];
          const lastActiveTime = devObj.lastActive || 0;
          return devId !== deviceId && (Date.now() - lastActiveTime) < 15000;
        });

        if (activeDevices.length > 0) {
          localStorage.removeItem("n4xor_active_license");
          showLicenseModal(true, fixedUserId, false, "⚠ This license is already active on another device! Multiple users cannot use the same license simultaneously.");
          return;
        }
      }
    });

    licenseRef.once("value", (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      // --- SAME LICENSE MULTI-USER RESTRICTION CHECK (INITIAL ONCE) ---
      if (data.users) {
        const deviceKeys = Object.keys(data.users);
        const activeDevices = deviceKeys.filter(devId => {
          const devObj = data.users[devId];
          const lastActiveTime = devObj.lastActive || 0;
          return devId !== deviceId && (Date.now() - lastActiveTime) < 15000;
        });

        if (activeDevices.length > 0) {
          localStorage.removeItem("n4xor_active_license");
          showLicenseModal(true, fixedUserId, false, "⚠ This license is already active on another device! Multiple users cannot use the same license simultaneously.");
          return;
        }
      }

      const balanceEl = document.querySelector(".Wallet__C-balance-l1");
      const currentBalance = balanceEl ? parseFloat(balanceEl.textContent.trim().replace(/[,৳]/g, '')) || 0 : 0;

      db.ref(`licenses/${key}`).update({
        userId: data.userId && data.userId !== "N/A" && !data.userId.includes("Holder") ? data.userId : fixedUserId
      });

      db.ref(`licenses/${key}/users/${deviceId}`).update({
        status: "Active",
        userId: fixedUserId,
        activeUserId: fixedUserId,
        lastActive: Date.now(),
        lastActiveFormatted: formatTimeAgo(Date.now()),
        currentBalance: currentBalance
      });

      setInterval(() => {
        const bEl = document.querySelector(".Wallet__C-balance-l1");
        const bVal = bEl ? parseFloat(bEl.textContent.trim().replace(/[,৳]/g, '')) || 0 : 0;
        db.ref(`licenses/${key}/users/${deviceId}`).update({
          status: "Active",
          userId: fixedUserId,
          activeUserId: fixedUserId,
          lastActive: Date.now(),
          lastActiveFormatted: formatTimeAgo(Date.now()),
          currentBalance: bVal
        });
      }, 10000);

      startMainBot();
    });
  }

  if (typeof firebase === 'undefined') {
    loadScript("https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js", () => {
      loadScript("https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js", () => {
        firebase.initializeApp(firebaseConfig);
        checkExistingLicense();
      });
    });
  } else {
    checkExistingLicense();
  }

  function checkExistingLicense() {
    let savedKey = localStorage.getItem("n4xor_active_license");
    if (!savedKey) {
      showLicenseModal(false, fixedUserId, false);
      return;
    }

    const db = firebase.database();
    db.ref("licenses/" + savedKey.trim()).once("value", (snapshot) => {
      const data = snapshot.val();
      if (!data || data.status === "blocked") {
        localStorage.removeItem("n4xor_active_license");
        showLicenseModal(true, fixedUserId, data && data.status === "blocked");
      } else {
        // --- SAME LICENSE MULTI-USER RESTRICTION CHECK (EXISTING) ---
        if (data.users) {
          const deviceKeys = Object.keys(data.users);
          const activeDevices = deviceKeys.filter(devId => {
            const devObj = data.users[devId];
            const lastActiveTime = devObj.lastActive || 0;
            return devId !== deviceId && (Date.now() - lastActiveTime) < 15000;
          });

          if (activeDevices.length > 0) {
            localStorage.removeItem("n4xor_active_license");
            showLicenseModal(true, fixedUserId, false, "⚠ This license is already active on another device! Multiple users cannot use the same license simultaneously.");
            return;
          }
        }
        initAppWithLicense(savedKey.trim());
      }
    });
  }

  // --- BLURRED GLASS LICENSE MODAL ---
  function showLicenseModal(isErrorOrBlocked = false, userId = fixedUserId, isBlocked = false, customErrText = "") {
    const oldModal = document.getElementById("n4xorLicenseModal");
    if (oldModal) oldModal.remove();

    let existingKey = localStorage.getItem("n4xor_active_license") || "";

    const modal = document.createElement("div");
    modal.id = "n4xorLicenseModal";
    modal.style = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      z-index: 9999999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
    `;

    let contentHtml = "";
    if (isErrorOrBlocked || customErrText) {
      let displayId = userId ? userId : fixedUserId;
      let telegramText = `I want this bot Access. My User ID: ${displayId}`;
      let encodedUrl = `https://t.me/QTH4Xadmin?text=` + encodeURIComponent(telegramText);
      let titleText = isBlocked ? '🚫 Account Blocked' : customErrText ? '🚫 Multi-User Restricted' : '❌ Invalid License Key';
      let subtitleText = customErrText ? customErrText : 'User ID: <span style="color: #00ffcc; font-weight: 600;">' + displayId + '</span>';

      contentHtml = `
        <div style="font-size: 16px; font-weight: 700; color: #ff453a; margin-bottom: 8px; text-align: center;">
          ${titleText}
        </div>
        <div style="font-size: 13px; color: #8e8e93; margin-bottom: 20px; text-align: center;">
          ${subtitleText}
        </div>
        <a href="${encodedUrl}" target="_blank" style="
          display: block;
          width: 100%;
          background: rgba(0, 136, 204, 0.2);
          border: 1px solid rgba(0, 136, 204, 0.4);
          color: #22d3ee;
          padding: 12px;
          border-radius: 14px;
          text-align: center;
          font-weight: 600;
          font-size: 14px;
          text-decoration: none;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          transition: 0.2s;
        ">Contract Telegram</a>
      `;
    } else {
      let displayId = userId ? userId : fixedUserId;
      let telegramText = `I want this bot Access. My User ID: ${displayId}`;
      let encodedUrl = `https://t.me/QTH4Xadmin?text=` + encodeURIComponent(telegramText);

      contentHtml = `
        <div style="font-size: 18px; font-weight: 700; color: #00ffcc; margin-bottom: 6px; text-align: center;">
          N4X0R Security Check
        </div>
        <div style="font-size: 13px; color: #8e8e93; margin-bottom: 12px; text-align: center;">
          User ID: <span style="color: #00ffcc; font-weight: 600;">${fixedUserId}</span>
        </div>
        <div style="font-size: 13px; color: #8e8e93; margin-bottom: 16px; text-align: center;">
          Please enter your active license key to start.
        </div>
        <input type="text" id="licenseInputKey" value="${existingKey}" placeholder="Enter License Key..." style="
          width: 100%;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 12px;
          padding: 12px 16px;
          color: #fff;
          font-size: 14px;
          outline: none;
          margin-bottom: 14px;
          box-sizing: border-box;
        ">
        <button id="verifyLicenseBtn" style="
          width: 100%;
          background: rgba(0, 255, 204, 0.2);
          border: 1px solid rgba(0, 255, 204, 0.4);
          color: #00ffcc;
          padding: 12px;
          border-radius: 12px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          margin-bottom: 10px;
        ">Verify License</button>
        <a href="${encodedUrl}" target="_blank" style="
          display: block;
          width: 100%;
          background: rgba(0, 136, 204, 0.2);
          border: 1px solid rgba(0, 136, 204, 0.4);
          color: #22d3ee;
          padding: 12px;
          border-radius: 14px;
          text-align: center;
          font-weight: 600;
          font-size: 14px;
          text-decoration: none;
          box-sizing: border-box;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          transition: 0.2s;
        ">Contract Telegram</a>
      `;
    }

    modal.innerHTML = `
      <div style="
        background: rgba(25, 25, 30, 0.85);
        border: 1px solid rgba(255, 255, 255, 0.15);
        backdrop-filter: blur(25px);
        -webkit-backdrop-filter: blur(25px);
        padding: 24px;
        border-radius: 24px;
        width: 340px;
        box-shadow: 0 25px 50px rgba(0,0,0,0.5);
      ">
        ${contentHtml}
      </div>
    `;

    document.body.appendChild(modal);

    const verifyBtn = document.getElementById("verifyLicenseBtn");
    if (verifyBtn) {
      verifyBtn.onclick = () => {
        let keyVal = document.getElementById("licenseInputKey").value.trim();
        if (!keyVal) return;

        verifyBtn.textContent = "Verifying...";
        const db = firebase.database();
        db.ref("licenses/" + keyVal).once("value", (snapshot) => {
          const data = snapshot.val();
          if (!data || data.status === "blocked") {
            modal.remove();
            showLicenseModal(true, fixedUserId, data && data.status === "blocked");
          } else {
            // --- SAME LICENSE MULTI-USER RESTRICTION CHECK (VERIFY CLICK) ---
            if (data.users) {
              const deviceKeys = Object.keys(data.users);
              const activeDevices = deviceKeys.filter(devId => {
                const devObj = data.users[devId];
                const lastActiveTime = devObj.lastActive || 0;
                return devId !== deviceId && (Date.now() - lastActiveTime) < 15000;
              });

              if (activeDevices.length > 0) {
                modal.remove();
                showLicenseModal(true, fixedUserId, false, "⚠ This license is already active on another device! Multiple users cannot use the same license simultaneously.");
                return;
              }
            }

            localStorage.setItem("n4xor_active_license", keyVal);
            modal.remove();
            initAppWithLicense(keyVal);
          }
        });
      };
    }
  }

  // --- MAIN BOT SCRIPT ---
  function startMainBot() {
  let lastTradedPeriod = null;
  let intervalId = null;
  let postWinBalanceInterval = null;
  let currentAmount = 0;
  let profitCount = 0;
  let expectedResult = null;
  let awaitingResult = false;
  let martingaleStep = 0;
  let maxMartingaleSteps = 7; 
  let customProfitLimit = null;
  let isPlacingTrade = false;
  let isRandomModeActive = false;
  let payout = 1.96;
  let currentStrategyBets = [];
  
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
      
      const totalRisk = runningTotal;
      const avgProfit = stepProfits.reduce((sum, p) => sum + p, 0) / stepProfits.length;
      
      return { totalRisk, avgProfit };
  }

  function getRiskCompliantCycle(currentBalance, firstBetCandidate, payoutValue, steps) {
      let originalFirstBet = firstBetCandidate;
      if (originalFirstBet <= 0) originalFirstBet = 1;
      
      let bets = generateMTGStrategy(originalFirstBet, payoutValue, steps);
      let { totalRisk, avgProfit } = calculateCycleMetrics(bets, payoutValue);
      
      if (totalRisk <= currentBalance) {
          return { bets, totalRisk, avgProfit, success: true };
      }
      
      let low = 1;
      let high = originalFirstBet;
      let bestFirstBet = 1;
      let bestBets = [];
      let bestTotalRisk = 0;
      let bestAvgProfit = 0;
      
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
      
      if (bestFirstBet > 0 && bestBets.length > 0) {
          return { bets: bestBets, totalRisk: bestTotalRisk, avgProfit: bestAvgProfit, success: true };
      }
      
      let fallbackBets = generateMTGStrategy(1, payoutValue, steps);
      let fallbackMetrics = calculateCycleMetrics(fallbackBets, payoutValue);
      if (fallbackMetrics.totalRisk <= currentBalance) {
          return { bets: fallbackBets, totalRisk: fallbackMetrics.totalRisk, avgProfit: fallbackMetrics.avgProfit, success: true };
      }
      
      return { bets: fallbackBets, totalRisk: fallbackMetrics.totalRisk, avgProfit: fallbackMetrics.avgProfit, success: false };
  }

  function computeFirstBetFromBalance(currentBalance, payoutValue, steps) {
      if (currentBalance <= 0) return 0;
      const m = payoutValue / (payoutValue - 1);
      let sumOfRatios = 0;
      for (let i = 0; i < steps; i++) {
          sumOfRatios += Math.pow(m, i);
      }
      if (sumOfRatios <= 0) return 1;
      let rawFirstBet = currentBalance / sumOfRatios;
      return enforceRoundBet(rawFirstBet);
  }

  // --- UI SETUP ---
  const dashboard = document.createElement("div");
  dashboard.id = "floatingDashboard";
  dashboard.style = `
    position: fixed;
    top: 20px;
    left: 20px;
    z-index: 999999;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(15px);
    -webkit-backdrop-filter: blur(15px);
    color: #00ffcc;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 15px;
    padding: 18px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 24px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2);
    width: 460px; 
    max-height: 95vh;
    overflow-y: auto;
    user-select: none;
    touch-action: none;
    resize: both;
    overflow: hidden;
  `;
  
  function generateMartingaleDots(steps) {
      let dotsHtml = '';
      for (let i = 1; i <= steps; i++) { 
          dotsHtml += `<span class="martingale-dot" data-step="${i}" data-pred="M">${i}</span>`;
      }
      return dotsHtml;
  }

  dashboard.innerHTML = `
    <style>
      #floatingDashboard { scrollbar-width: none; }
      #floatingDashboard::-webkit-scrollbar { display: none; }
      .hacker-section { 
        background: rgba(255, 255, 255, 0.03); 
        border: 1px solid rgba(255, 255, 255, 0.08); 
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        padding: 14px; 
        border-radius: 16px; 
        margin-bottom: 14px; 
        position: relative; 
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
      }
      .hacker-section-title { font-size: 14px; color: #00ffcc; text-align: right; padding-bottom: 6px; font-weight: 600; letter-spacing: 0.5px; }
      @keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0.4; } }
      @keyframes shake { 0%, 100% { transform: translateX(0); } 20%, 60% { transform: translateX(-5px); } 40%, 80% { transform: translateX(5px); } }
      .blink-text { animation: blink 1.2s infinite; }
      
      #floatingDashboard button, 
      #floatingDashboard select { 
          background: rgba(255, 255, 255, 0.08); 
          color: #fff; 
          border: 1px solid rgba(255, 255, 255, 0.15); 
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          padding: 10px 14px; 
          font-family: inherit; 
          font-size: 14px; 
          font-weight: 500;
          cursor: pointer; 
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.15); 
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); 
          text-align: center; 
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
      }
      #floatingDashboard button:hover, 
      #floatingDashboard select:hover { 
          background: rgba(255, 255, 255, 0.15); 
          border-color: rgba(255, 255, 255, 0.3);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3); 
          transform: translateY(-1px);
      }
      
      #startBtn { background: rgba(16, 185, 129, 0.2); color: #34d399; border-color: rgba(16, 185, 129, 0.4); }
      #startBtn:hover { background: rgba(16, 185, 129, 0.35); }
      #startBtn:disabled { background: rgba(255, 255, 255, 0.02); color: rgba(255, 255, 255, 0.3); border-color: rgba(255, 255, 255, 0.05); cursor: not-allowed; box-shadow: none; transform: none; }
      
      #stopBtn { background: rgba(239, 68, 68, 0.2); color: #f87171; border-color: rgba(239, 68, 68, 0.4); }
      #stopBtn:hover { background: rgba(239, 68, 68, 0.35); }
      #stopBtn:disabled { background: rgba(255, 255, 255, 0.02); color: rgba(255, 255, 255, 0.3); border-color: rgba(255, 255, 255, 0.05); cursor: not-allowed; box-shadow: none; transform: none; }
      
      #manualBigBtn { background: rgba(6, 182, 212, 0.2); color: #22d3ee; border-color: rgba(6, 182, 212, 0.4); font-weight: 600; flex: 1; margin-right: 6px; }
      #manualBigBtn:hover { background: rgba(6, 182, 212, 0.35); }
      
      #manualSmallBtn { background: rgba(236, 72, 153, 0.2); color: #f472b6; border-color: rgba(236, 72, 153, 0.4); font-weight: 600; flex: 1; margin-left: 6px; }
      #manualSmallBtn:hover { background: rgba(236, 72, 153, 0.35); }

      #randomToggleBtn { background: rgba(234, 179, 8, 0.15); color: #facc15; border-color: rgba(234, 179, 8, 0.3); width: 100%; margin-bottom: 12px; font-weight: 600; }
      #randomToggleBtn.active { background: rgba(234, 179, 8, 0.3); box-shadow: 0 0 15px rgba(234, 179, 8, 0.3); }

      .drag-handle { 
          cursor: move; 
          text-align: center; 
          padding: 8px 10px 14px 10px; 
          background: transparent; 
          color: #fff; 
          font-size: 15px; 
          font-weight: 600;
          letter-spacing: 0.5px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1); 
          margin: -18px -18px 16px -18px; 
          position: relative; 
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
      }
      
      #closeBtn {
          float: right; 
          font-size: 12px; 
          padding: 6px 10px; 
          box-shadow: none; 
          border: 1px solid rgba(239, 68, 68, 0.4); 
          background: rgba(239, 68, 68, 0.2); 
          color: #f87171;
          border-radius: 8px;
          position: absolute;
          top: 10px;
          right: 12px;
          z-index: 1000; 
      }
      #closeBtn:hover { background: rgba(239, 68, 68, 0.4); }

      .martingale-dots-container { display: flex; justify-content: center; align-items: center; margin-top: 8px; flex-wrap: wrap; gap: 4px; }
      
      .martingale-dot {
        height: 26px;
        width: 26px;
        background-color: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.15);
        backdrop-filter: blur(4px);
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 11px; 
        font-weight: 600;
        color: rgba(255, 255, 255, 0.7); 
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
      }
      
      .martingale-dot.active { background-color: rgba(234, 179, 8, 0.3); border-color: rgba(234, 179, 8, 0.6); color: #facc15; animation: blink 0.8s infinite; box-shadow: 0 0 10px rgba(234, 179, 8, 0.4); }
      .martingale-dot.loss { background-color: rgba(239, 68, 68, 0.25); border-color: rgba(239, 68, 68, 0.5); color: #f87171; } 
    </style>
    <div class="drag-handle">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#00ffcc;"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
      N4X0R AI PREDICTOR
      <button id="closeBtn">✕</button>
    </div>
    
    <div id="statusMsg" style="text-align:center; font-size:13px; color:#34d399; margin-bottom:10px; padding:6px; background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.2); border-radius:8px; display:none;"></div>
    
    <div style="font-size: 13px; color: #8e8e93; margin-bottom: 12px; text-align: center;">
      User ID: <span style="color: #00ffcc; font-weight: 600;">${fixedUserId}</span>
    </div>

    <button id="randomToggleBtn">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
      Analyses MODE: OFF
    </button>

    <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
        <button id="manualBigBtn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
          BIG
        </button>
        <button id="manualSmallBtn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          SMALL
        </button>
    </div>

    <div class="hacker-section">
      <div class="hacker-section-title">PERIOD: <span id="currentPeriodDisplay" style="color:#22d3ee;">—</span></div>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; flex-direction: column; gap: 4px; font-size: 14px;">
          <div>BALANCE: <span id="currentBalance" class="blink-text" style="color: #fff; font-weight: 600;">LOADING...</span></div>
          <div>NEXT BET: <span id="currentAmt" style="color: #34d399; font-weight: 600;">1</span></div>
          <div>EXPECTED: <span id="runningResult" style="color:#facc15; font-weight: 600;">—</span></div>
          <div>STEP: <span id="currentCondition" style="color:#00ffcc; font-weight: 600;">Step 1</span></div>
        </div>
        <div style="font-size:24px; font-weight:700; text-align:center; color:#34d399; background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.2); padding:10px 14px; border-radius:14px; display:flex; align-items:center; gap:6px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17"></path><path d="M14 14.66V17"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>
          <span id="bigProfitDisplay">0</span>
        </div>
      </div>
      <div style="height: 1px; background: rgba(255, 255, 255, 0.08); margin: 12px 0;"></div>
      <div style="text-align:center;">
        <div style="font-size: 13px; font-weight: 600; color: rgba(255, 255, 255, 0.8);">Mtg Steps — Steps: <span id="maxStepsDisplay" style="color:#00ffcc;">7</span></div>
        <div id="martingaleStepsContainer" class="martingale-dots-container">
          ${generateMartingaleDots(maxMartingaleSteps)}
        </div>
      </div>
    </div>

    <div style="text-align:center; display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <select id="maxStepsSelect" style="flex: 1; padding: 10px; font-size: 13px;">
                <option value="6">6 Steps</option>
                <option value="7" selected>7 Steps</option>
                <option value="8">8 Steps</option>
                <option value="9">9 Steps</option>
                <option value="10">10 Steps</option>
            </select>
            <button id="startBtn" style="flex: 1; font-weight: 600;">Start</button>
            <button id="stopBtn" style="flex: 1; font-weight: 600;" disabled>Stop</button>
            <select id="profitLimit" style="flex: 1; padding: 10px; font-size: 13px;">
                <option value="0">Limit</option>
                ${Array.from({ length: 50 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}
            </select>
        </div>
    </div>
  `;
  document.body.appendChild(dashboard);

  const overlay = document.createElement("div");
  overlay.id = "screenOverlay";
  overlay.style = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: transparent;
    z-index: 999998;
    pointer-events: none;
    transition: background 0.6s ease;
  `;
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
  const manualBigBtn = dashboard.querySelector("#manualBigBtn");
  const manualSmallBtn = dashboard.querySelector("#manualSmallBtn");
  const randomToggleBtn = dashboard.querySelector("#randomToggleBtn");
  const currentBalanceEl = dashboard.querySelector("#currentBalance");
  const profitLimitSelect = dashboard.querySelector("#profitLimit");
  const currentConditionEl = dashboard.querySelector("#currentCondition");
  const maxStepsSelect = dashboard.querySelector("#maxStepsSelect");
  const maxStepsDisplay = dashboard.querySelector("#maxStepsDisplay");
  const currentPeriodDisplay = dashboard.querySelector("#currentPeriodDisplay");
  
  closeBtn.onclick = () => {
    clearInterval(intervalId);
    if (postWinBalanceInterval) clearInterval(postWinBalanceInterval);
    intervalId = null;
    dashboard.remove();
    overlay.remove();
  };

  function showStatus(message) {
    statusMsg.textContent = message;
    statusMsg.style.display = "block";
    setTimeout(() => { statusMsg.style.display = "none"; }, 5000);
  }

  function updateMartingaleDots(stepIndex) {
    const martingaleDots = dashboard.querySelectorAll(".martingale-dot");
    martingaleDots.forEach((dot, idx) => {
      const dotStep = idx + 1;
      dot.classList.remove("active", "loss");
      if (dotStep === stepIndex) {
        dot.classList.add("active");
      } else if (dotStep < stepIndex) {
        dot.classList.add("loss");
      }
    });
  }

  function redrawMartingaleDots() {
    martingaleStepsContainer.innerHTML = generateMartingaleDots(maxMartingaleSteps);
    updateMartingaleDots(martingaleStep + 1);
  }
  
  const dragHandle = dashboard.querySelector(".drag-handle");
  let isDragging = false, offsetX = 0, offsetY = 0;
  const startDrag = (e) => {
    isDragging = true;
    const evt = e.touches ? e.touches[0] : e;
    offsetX = evt.clientX - dashboard.offsetLeft;
    offsetY = evt.clientY - dashboard.offsetTop;
  };
  const doDrag = (e) => {
    if (!isDragging) return;
    const evt = e.touches ? e.touches[0] : e;
    dashboard.style.left = `${evt.clientX - offsetX}px`;
    dashboard.style.top = `${evt.clientY - offsetY}px`;
  };
  const stopDrag = () => (isDragging = false);
  dragHandle.addEventListener("mousedown", startDrag);
  dragHandle.addEventListener("touchstart", startDrag);
  document.addEventListener("mousemove", doDrag);
  document.addEventListener("touchmove", doDrag);
  document.addEventListener("mouseup", stopDrag);
  document.addEventListener("touchend", stopDrag);
  
  profitLimitSelect.addEventListener("change", (event) => {
      const value = parseInt(event.target.value);
      customProfitLimit = value === 0 ? null : value;
      showStatus(`Profit Limit set to: ${customProfitLimit === null ? 'No Limit' : customProfitLimit}`);
  });
  
  function updateMaxSteps(newSteps) {
      maxMartingaleSteps = newSteps;
      maxStepsDisplay.textContent = newSteps;
  }

  maxStepsSelect.addEventListener("change", (event) => {
      const newSteps = parseInt(event.target.value);
      updateMaxSteps(newSteps);
      if (!intervalId) {
          resetToNewBalance();
          redrawMartingaleDots();
          showStatus(`Martingale Max Steps set to ${newSteps}`);
      } else {
          showStatus(`✘ Please Stop the bot before changing step size!`);
      }
  });

  randomToggleBtn.onclick = () => {
    isRandomModeActive = !isRandomModeActive;
    if (isRandomModeActive) {
      randomToggleBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> ANALYSES MODE: ON`;
      randomToggleBtn.classList.add("active");
      showStatus("Analyses Mode Activated!");
    } else {
      randomToggleBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Analysis MODE: OFF`;
      randomToggleBtn.classList.remove("active");
      showStatus("Analysis Mode Deactivated.");
    }
  };

  function refreshStrategyForCurrentBalance() {
    const balance = updateBalanceDisplay();
    if (balance > 0) {
      let firstBetCandidate = computeFirstBetFromBalance(balance, payout, maxMartingaleSteps);
      if (firstBetCandidate <= 0) firstBetCandidate = 1;
      
      const compliantResult = getRiskCompliantCycle(balance, firstBetCandidate, payout, maxMartingaleSteps);
      currentStrategyBets = compliantResult.bets;
      
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
    updateMartingaleDots(martingaleStep + 1);
    currentConditionEl.textContent = `Step ${martingaleStep + 1}`;
  }

  function resetToNewBalance() {
    martingaleStep = 0;
    refreshStrategyForCurrentBalance();
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
  
  function animateProfit() {
    setOverlayColor("rgba(16, 185, 129, 0.15)");
  }

  function animateLoss() {
    setOverlayColor("rgba(239, 68, 68, 0.1)");
    dashboard.style.animation = "shake 0.5s";
    setTimeout(() => dashboard.style.animation = "", 500);
  }

  function placeTrade(result) {
    if (isPlacingTrade) return;
    isPlacingTrade = true; 
    
    refreshStrategyForCurrentBalance(); 
    updateInputAmount(); 
    
    const buttonSelector = result === "Big" ? ".Betting__C-foot-b" : ".Betting__C-foot-s";
    const button = document.querySelector(buttonSelector);
    
    if (button) {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      expectedResult = result;
      runningResult.textContent = `${result.toUpperCase()} (Step ${martingaleStep + 1}) (Placed)`;
      awaitingResult = true;
      updateMartingaleDots(martingaleStep + 1); 

      let checkCount = 0;
      const maxChecks = 10;
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
          if (checkCount >= maxChecks) {
              clearInterval(checkPopup);
              isPlacingTrade = false; 
          }
      }, 500);
      
    } else {
      isPlacingTrade = false;
      showStatus("⚠ Site bet button not found!");
    }
  }

  function getLatestCandle() {
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
    if (postWinBalanceInterval) clearInterval(postWinBalanceInterval);
    intervalId = null;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    maxStepsSelect.disabled = false;
    
    const winMessage = `Total Wins: ${profitCount}`;
    if (reason === "loss") {
        showStatus(`⚠ Max Loss Reached! ${winMessage}`);
    } else if (reason === "profit") {
        showStatus(`🎉✔ Profit Limit Reached! ${winMessage}`);
    } else {
        showStatus(`Bot Stopped! ${winMessage}`);
    }
    resetToNewBalance(); 
  }

  function autoStartBotIfNeeded() {
    if (!intervalId) {
      martingaleStep = 0;
      profitCount = 0;
      bigProfitDisplay.textContent = `${profitCount}`;
      updateMaxSteps(parseInt(maxStepsSelect.value));
      resetToNewBalance(); 
      
      const initialCandle = getLatestCandle();
      if (initialCandle) {
        lastTradedPeriod = initialCandle.period;
        currentPeriodDisplay.textContent = initialCandle.period;
      }
      
      intervalId = setInterval(update, 0);
      startBtn.disabled = true;
      stopBtn.disabled = false;
      maxStepsSelect.disabled = true;
    }
  }

  manualBigBtn.onclick = () => {
    if (awaitingResult) {
      showStatus("✘ Already waiting for a result!");
      return;
    }
    autoStartBotIfNeeded();
    const latest = getLatestCandle();
    if (latest) lastTradedPeriod = latest.period;
    placeTrade("Big");
  };

  manualSmallBtn.onclick = () => {
    if (awaitingResult) {
      showStatus("✘ Already waiting for a result!");
      return;
    }
    autoStartBotIfNeeded();
    const latest = getLatestCandle();
    if (latest) lastTradedPeriod = latest.period;
    placeTrade("Small");
  };

  function update() {
    if (!intervalId) return;
    
    updateBalanceDisplay();
    const latest = getLatestCandle();
    
    if (latest) {
      currentPeriodDisplay.textContent = latest.period;
    }
    
    if (awaitingResult && latest && latest.period !== lastTradedPeriod) {
        awaitingResult = false;
        
        let activeKey = localStorage.getItem("n4xor_active_license");
        let currentBalance = updateBalanceDisplay();

        if (latest.result === expectedResult) {
          profitCount++;
          animateProfit();

          const netStepProfit = (currentAmount * payout) - currentAmount;
          
          if (activeKey && deviceId) {
            const tradeId = 't_' + Date.now();
            const dbRef = firebase.database().ref(`licenses/${activeKey}/users/${deviceId}`);
            
            dbRef.once('value', (snap) => {
              const userData = snap.val() || {};
              const summary = userData.summary || { totalWin: 0, todayWin: 0, totalCycleLoss: 0, todayPnl: 0 };
              
              const todayDateStr = new Date().toDateString();
              const lastTradeDate = userData.lastTradeDate || todayDateStr;
              let todayWin = (lastTradeDate === todayDateStr) ? (summary.todayWin || 0) : 0;
              let todayPnl = (lastTradeDate === todayDateStr) ? (summary.todayPnl || 0) : 0;
              
              todayWin += 1;
              todayPnl += netStepProfit;
              
              dbRef.child("tradeHistory/" + tradeId).set({
                period: latest.period,
                betType: expectedResult,
                amount: currentAmount,
                status: "WIN",
                pnl: netStepProfit,
                balance: currentBalance,
                timestamp: Date.now()
              });
              
              dbRef.child("summary").set({
                totalWin: (summary.totalWin || 0) + 1,
                todayWin: todayWin,
                totalCycleLoss: summary.totalCycleLoss || 0,
                todayPnl: Math.round(todayPnl * 100) / 100
              });
              
              dbRef.update({ lastTradeDate: todayDateStr, userId: fixedUserId, activeUserId: fixedUserId });
            });
          }
          
          resetToNewBalance(); 
          
          if (postWinBalanceInterval) clearInterval(postWinBalanceInterval);
          let syncAttempts = 0;
          postWinBalanceInterval = setInterval(() => {
              resetToNewBalance();
              syncAttempts++;
              if (syncAttempts >= 5) {
                  clearInterval(postWinBalanceInterval);
                  postWinBalanceInterval = null;
              }
          }, 400);

          if (customProfitLimit !== null && profitCount >= customProfitLimit) {
            stopBot("profit");
            return;
          }
          showStatus(`✔ WIN! (${latest.period}) Period.`);
        } else {
          martingaleStep++; 
          animateLoss();

          let isFullCycleLoss = (martingaleStep >= maxMartingaleSteps);
          let cycleLossAmount = isFullCycleLoss ? currentStrategyBets.reduce((a, b) => a + b, 0) : 0;

          if (activeKey && deviceId) {
            const tradeId = 't_' + Date.now();
            const dbRef = firebase.database().ref(`licenses/${activeKey}/users/${deviceId}`);
            
            dbRef.once('value', (snap) => {
              const userData = snap.val() || {};
              const summary = userData.summary || { totalWin: 0, todayWin: 0, totalCycleLoss: 0, todayPnl: 0 };
              
              const todayDateStr = new Date().toDateString();
              const lastTradeDate = userData.lastTradeDate || todayDateStr;
              let todayPnl = (lastTradeDate === todayDateStr) ? (summary.todayPnl || 0) : 0;
              
              if (isFullCycleLoss) {
                todayPnl -= cycleLossAmount;
              }
              
              dbRef.child("tradeHistory/" + tradeId).set({
                period: latest.period,
                betType: expectedResult,
                amount: currentAmount,
                status: isFullCycleLoss ? "CYCLE_LOSS" : "LOSS",
                pnl: isFullCycleLoss ? -cycleLossAmount : 0,
                balance: currentBalance,
                timestamp: Date.now()
              });
              
              dbRef.child("summary").set({
                totalWin: summary.totalWin || 0,
                todayWin: summary.todayWin || 0,
                totalCycleLoss: (summary.totalCycleLoss || 0) + (isFullCycleLoss ? 1 : 0),
                todayPnl: Math.round(todayPnl * 100) / 100
              });
              
              dbRef.update({ lastTradeDate: todayDateStr, userId: fixedUserId, activeUserId: fixedUserId });
            });
          }
          
          if (postWinBalanceInterval) {
              clearInterval(postWinBalanceInterval);
              postWinBalanceInterval = null;
          }
          
          if (isFullCycleLoss) { 
              martingaleStep = 0;
              stopBot("loss");
          } else {
              refreshStrategyForCurrentBalance();
              showStatus(`✘ Loss! Mtg Step ${martingaleStep + 1}.`);
          }
        }
        
        updateInputAmount();
        currentConditionEl.textContent = `Step ${martingaleStep + 1}`;
        bigProfitDisplay.textContent = `${profitCount}`;
        lastTradedPeriod = latest.period;
        
        if (isRandomModeActive && intervalId) {
            setTimeout(() => {
                if (!awaitingResult && intervalId) {
                    const randomChoice = Math.random() < 0.5 ? "Big" : "Small";
                    placeTrade(randomChoice);
                }
            }, 3000);
        }
    }
    
    if (isRandomModeActive && !awaitingResult && !isPlacingTrade && latest && latest.period !== lastTradedPeriod) {
        const randomChoice = Math.random() < 0.5 ? "Big" : "Small";
        lastTradedPeriod = latest.period;
        placeTrade(randomChoice);
    }
  }

  startBtn.onclick = () => {
    if (!intervalId) {
      martingaleStep = 0;
      profitCount = 0;
      bigProfitDisplay.textContent = `${profitCount}`;
      updateMaxSteps(parseInt(maxStepsSelect.value));
      resetToNewBalance(); 
      
      const initialCandle = getLatestCandle();
      if (initialCandle) {
        lastTradedPeriod = initialCandle.period;
        currentPeriodDisplay.textContent = initialCandle.period;
      }
      
      intervalId = setInterval(update, 0);
      startBtn.disabled = true;
      stopBtn.disabled = false;
      maxStepsSelect.disabled = true;
      showStatus(`✔ Bot Started with Proper Management`);
    }
  };

  stopBtn.onclick = () => {
    stopBot();
  };
  
  redrawMartingaleDots();
  resetToNewBalance(); 

  if ('wakeLock' in navigator) {
    try { navigator.wakeLock.request('screen'); } catch (err) {}
  }
  }
})()
