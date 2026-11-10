(function() {
    // 1. Date & Storage Management (Auto reset on date change)
    const todayStr = new Date().toISOString().split('T')[0];
    let savedDate = localStorage.getItem('mqt_history_date');
    if (savedDate !== todayStr) {
        localStorage.setItem('mqt_history_date', todayStr);
        localStorage.setItem('mqt_history_logs', JSON.stringify([]));
        localStorage.setItem('mqt_step', '0');
    }

    try {
        window.mqtStep = parseInt(localStorage.getItem('mqt_step')) || 0;
    } catch (e) {
        window.mqtStep = 0;
    }

    try {
        window.mqtTargetProfit = parseFloat(localStorage.getItem('mqt_target_profit')) || null;
    } catch (e) {
        window.mqtTargetProfit = null;
    }

    const saveMQTState = (tradeDetails = null) => {
        try {
            localStorage.setItem('mqt_step', window.mqtStep);
            if (window.mqtTargetProfit !== null) {
                localStorage.setItem('mqt_target_profit', window.mqtTargetProfit);
            }
            if (tradeDetails) {
                let logs = [];
                try {
                    logs = JSON.parse(localStorage.getItem('mqt_history_logs')) || [];
                } catch (e) { logs = []; }
                logs.push({
                    time: new Date().toLocaleTimeString(),
                    ...tradeDetails
                });
                localStorage.setItem('mqt_history_logs', JSON.stringify(logs));
            }
        } catch (e) {}
    };

    // 2. Core MQT Engine
    const updateMQT = (forceReset = false, resultType = null, betAmt = 0) => {
        const bEl = document.querySelector('.bal-btn-value');
        const pEl = document.querySelector('.mqt-payout-line-val');
        const iEl = document.querySelector('.mqt-amount-input');
        if (!bEl || !pEl || !iEl) return;

        const bal = parseFloat(bEl.innerText.replace(/[^0-9.-]+/g, "")) || 0;
        const payout = parseFloat(pEl.innerText.replace(/[^0-9.-]+/g, "")) || 90;
        const pDecimal = payout / 100;

        if (forceReset || window.mqtTargetProfit === null) {
            const baseRiskAmt = Math.max(1, parseFloat((bal * 0.0135).toFixed(2)));
            window.mqtTargetProfit = parseFloat((baseRiskAmt * pDecimal).toFixed(2));
            if (forceReset) {
                window.mqtStep = 0;
            }
        }

        let prevInvested = 0;
        let currentBet = 0;
        for (let s = 0; s <= window.mqtStep; s++) {
            if (s === 0) {
                currentBet = window.mqtTargetProfit / pDecimal;
            } else {
                currentBet = (prevInvested + window.mqtTargetProfit) / pDecimal;
            }
            prevInvested += currentBet;
        }

        let finalAmt = Math.max(1, parseFloat(currentBet.toFixed(2)));

        if (resultType) {
            saveMQTState({
                step: window.mqtStep + 1,
                bet: betAmt,
                result: resultType,
                targetProfit: window.mqtTargetProfit
            });
        } else {
            saveMQTState();
        }

        iEl.focus();
        iEl.click();
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        let attempts = 0;
        const verifyAndApply = () => {
            nativeSetter.call(iEl, finalAmt);
            iEl.dispatchEvent(new Event('input', { bubbles: true }));
            iEl.dispatchEvent(new Event('change', { bubbles: true }));
            iEl.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            attempts++;
            setTimeout(() => {
                const currentVal = parseFloat(iEl.value) || 0;
                if (Math.abs(currentVal - finalAmt) > 0.01 && attempts < 3) {
                    verifyAndApply();
                } else {
                    iEl.blur();
                    console.log('MQT Fixed Profit Step: ' + (window.mqtStep + 1) + ' | Bet: ' + finalAmt + ' | Target Profit: ' + window.mqtTargetProfit);
                }
            }, 80);
        };
        verifyAndApply();
    };

    updateMQT(false);

    // 3. Deposit Button Popup with iOS Liquid Glass UI & Download Feature
    const depBtn = document.querySelector('.mob-topbar-deposit-btn');
    if (depBtn) {
        depBtn.replaceWith(depBtn.cloneNode(true));
        const newDepBtn = document.querySelector('.mob-topbar-deposit-btn');
        if (newDepBtn) {
            newDepBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                let popup = document.getElementById('mqt-status-popup');
                if (!popup) {
                    popup = document.createElement('div');
                    popup.id = 'mqt-status-popup';
                    popup.style.cssText = `
                        position: fixed;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%) scale(0.9);
                        background: rgba(28, 31, 46, 0.75);
                        color: #FEFEFF;
                        padding: 20px;
                        border-radius: 20px;
                        z-index: 999999;
                        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                        width: 90%;
                        max-width: 360px;
                        text-align: left;
                        backdrop-filter: blur(25px);
                        -webkit-backdrop-filter: blur(25px);
                        max-height: 85vh;
                        overflow-y: auto;
                        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                        opacity: 0;
                    `;
                    document.body.appendChild(popup);
                    setTimeout(() => {
                        popup.style.transform = 'translate(-50%, -50%) scale(1)';
                        popup.style.opacity = '1';
                    }, 10);
                }

                const payoutVal = (parseFloat(document.querySelector('.mqt-payout-line-val')?.innerText) || 90) / 100;
                const tProfit = window.mqtTargetProfit || 0;
                let rowsHtml = '';
                let pInv = 0, cBet = 0;

                for (let s = 0; s < 6; s++) {
                    if (s === 0) {
                        cBet = tProfit / payoutVal;
                    } else {
                        cBet = (pInv + tProfit) / payoutVal;
                    }
                    pInv += cBet;
                    let bAmt = Math.max(1, parseFloat(cBet.toFixed(2)));
                    let isCurrent = (s === window.mqtStep);
                    let rowBg = isCurrent ? 'background: rgba(44, 153, 255, 0.25); border: 1px solid rgba(44, 153, 255, 0.5);' : 'background: rgba(53, 58, 77, 0.2);';
                    let textCol = isCurrent ? 'color: #2C99FF; font-weight: bold;' : 'color: #FEFEFF;';
                    
                    rowsHtml += `
                        <tr style="${rowBg} border-radius: 6px;">
                            <td style="padding: 8px; text-align: center; ${textCol}">Step ${s + 1}</td>
                            <td style="padding: 8px; text-align: right; ${textCol}">${bAmt.toFixed(2)}</td>
                            <td style="padding: 8px; text-align: right; color: #E95B4F;">${pInv.toFixed(2)}</td>
                            <td style="padding: 8px; text-align: right; color: #0FA055;">${tProfit.toFixed(2)}</td>
                        </tr>
                    `;
                }

                popup.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                        <b style="color: #2C99FF; font-size: 16px; letter-spacing: 0.3px;">🚀 MQT Liquid Dashboard</b>
                        <span id="mqt-close-pop" style="cursor: pointer; font-size: 20px; color: #E95B4F; font-weight: bold; padding: 2px 8px; background: rgba(233,91,79,0.1); border-radius: 50%;">&times;</span>
                    </div>
                    <div style="font-size: 13px; margin-bottom: 12px; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 10px;">
                        <div>Target Profit: <b style="color: #0FA055;">${tProfit.toFixed(2)}</b></div>
                        <div>Active Step: <b style="color: #2C99FF;">Step ${window.mqtStep + 1} / 6</b></div>
                        <div>Date: <span style="color: #FEFEFF;">${todayStr}</span></div>
                    </div>
                    <table style="width: 100%; border-collapse: separate; border-spacing: 0 4px; font-size: 12px; margin-bottom: 15px;">
                        <thead>
                            <tr style="color: #A0A5B9; font-size: 11px;">
                                <th style="padding: 4px; text-align: center;">Step</th>
                                <th style="padding: 4px; text-align: right;">Bet Amt</th>
                                <th style="padding: 4px; text-align: right;">Total Inv</th>
                                <th style="padding: 4px; text-align: right;">Profit</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                    <button id="mqt-download-history" style="width: 100%; background: linear-gradient(135deg, #2C99FF, #1e70cc); color: white; border: none; padding: 10px; border-radius: 10px; font-weight: bold; cursor: pointer; font-size: 13px; box-shadow: 0 4px 12px rgba(44,153,255,0.3);">📥 Download Today's History (.txt)</button>
                `;

                document.getElementById('mqt-close-pop').onclick = () => {
                    popup.style.transform = 'translate(-50%, -50%) scale(0.9)';
                    popup.style.opacity = '0';
                    setTimeout(() => popup.remove(), 250);
                };

                document.getElementById('mqt-download-history').onclick = () => {
                    let logs = [];
                    try {
                        logs = JSON.parse(localStorage.getItem('mqt_history_logs')) || [];
                    } catch (e) { logs = []; }

                    let fileContent = `=== MQT TRADING HISTORY REPORT (${todayStr}) ===\n\n`;
                    if (logs.length === 0) {
                        fileContent += "No trade history recorded yet for today.\n";
                    } else {
                        logs.forEach((log, index) => {
                            fileContent += `[${index + 1}] Time: ${log.time} | Step: ${log.step} | Result: ${log.result.toUpperCase()} | Bet Amount: ${log.bet} | Target Profit: ${log.targetProfit}\n`;
                        });
                    }

                    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `MQT_History_${todayStr}.txt`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                };
            });
        }
    }

    // 4. Mutation Observer for Win/Loss Detection
    const obs = new MutationObserver((mutations) => {
        mutations.forEach((m) => {
            m.addedNodes.forEach((node) => {
                if (node.nodeType === 1) {
                    const payoutVal = (parseFloat(document.querySelector('.mqt-payout-line-val')?.innerText) || 90) / 100;
                    const tProfit = window.mqtTargetProfit || 0;
                    let lastBetAmt = 0;
                    let prevInv = 0;
                    for (let s = 0; s <= window.mqtStep; s++) {
                        if (s === 0) { lastBetAmt = tProfit / payoutVal; }
                        else { lastBetAmt = (prevInv + tProfit) / payoutVal; }
                        prevInv += lastBetAmt;
                    }
                    lastBetAmt = Math.max(1, parseFloat(lastBetAmt.toFixed(2)));

                    if (node.classList.contains('trade-result-pill--loss') || (node.querySelector && node.querySelector('.trade-result-pill--loss'))) {
                        console.log('Loss detected! Moving to step: ' + (window.mqtStep + 1));
                        if (window.mqtStep < 5) {
                            window.mqtStep++;
                        }
                        updateMQT(false, 'loss', lastBetAmt);
                    } else if (node.classList.contains('trade-result-pill--win') || (node.querySelector && node.querySelector('.trade-result-pill--win'))) {
                        console.log('Win detected! Resetting step.');
                        window.mqtStep = 0;
                        updateMQT(true, 'win', lastBetAmt);
                    }
                }
            });
        });
    });

    obs.observe(document.body, { childList: true, subtree: true });
})();