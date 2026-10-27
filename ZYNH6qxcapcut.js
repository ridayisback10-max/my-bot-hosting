(function () {
    // ========== SCRIPT 1: TRADE TOOL ==========
    (function () {
        // ========== TOGGLE / STOP ==========
        if (window.tradeTimeout || window.uiOverrideInterval || window.observerInstance || window.rafId) {
            clearTimeout(window.tradeTimeout);
            clearInterval(window.uiOverrideInterval);
            if (window.rafId) cancelAnimationFrame(window.rafId);
            if (window.observerInstance) window.observerInstance.disconnect();
            if (window.flagObserver) window.flagObserver.disconnect();
            delete window.tradeTimeout;
            delete window.uiOverrideInterval;
            delete window.observerInstance;
            delete window.flagObserver;
            delete window.rafId;
            console.log("🛑 বন্ধ হয়েছে।");
            return;
        }

        // ========== SELECTORS ==========
        const s = {
            balance: '.Zt1hG',
            payoutAmount: '.section-deal__payout b,.section-deal__mobile-payout b',
            investment: '.GmATb span',
            tradePayout: '.omlQ2 b'
        };

        // ========== STATE ==========
        let lastCalculatedBalance = "$100.00";
        let initialStartingBalance = 100;
        let tradeCount = 0;
        let progressStartPercent = 75;
        let progressStepPercent = 2.5;
        let c = { s: 100, t: 10, r: 1.93, b: 100 };

        // ===== LOSS STATE =====
        let lossArmed = false;
        let totalLoss = 0;

        const f = n => '$' + Math.max(0, n).toLocaleString(undefined, {
            minimumFractionDigits: 2, maximumFractionDigits: 2
        });

        const getPercentLabel = () => {
            const pct = (c.r - 1) * 100;
            return Math.round(pct) + '%';
        };

        const getLeaderboardAmount = () => {
            const profit = Math.max(0, c.b - initialStartingBalance);
            const net = profit - totalLoss;
            return (net < 0 ? '-$' : '$') + Math.abs(net).toLocaleString(undefined, {
                minimumFractionDigits: 2, maximumFractionDigits: 2
            });
        };

        const getProgressPercent = () => {
            if (tradeCount === 0) return 0;
            return Math.min(100, progressStartPercent + (tradeCount - 1) * progressStepPercent);
        };

        const FLAG_URL = '/profile/images/flags.svg#flag-ae';
        const UAE_EMOJI = '🇦🇪';

        (function preloadFlag() {
            if (!window.__uaeFlagPreloaded) {
                const link = document.createElement('link');
                link.rel = 'preload';
                link.as = 'image';
                link.href = '/profile/images/flags.svg';
                link.type = 'image/svg+xml';
                document.head.appendChild(link);
                window.__uaeFlagPreloaded = true;
            }
        })();

        const u = () => {
            const p = getPercentLabel();
            const a = (c.t * c.r).toFixed(2) + ' $';

            document.querySelectorAll('.UI2Kh, .mobileSelectPercent, .section-deal__percent').forEach(el => {
                if (el.textContent !== p) el.textContent = p;
            });

            const payoutAmount = document.querySelector(s.payoutAmount);
            if (payoutAmount && payoutAmount.textContent !== a) payoutAmount.textContent = a;

            const invElem = document.querySelector(s.investment);
            const payElem = document.querySelector(s.tradePayout);
            const expInv = c.t.toFixed(2) + ' $';
            const expPay = (c.t * c.r).toFixed(2) + ' $';
            if (invElem && invElem.textContent !== expInv) invElem.textContent = expInv;
            if (payElem && payElem.textContent !== expPay) payElem.textContent = expPay;

            const balanceElem = document.querySelector(s.balance);
            if (balanceElem && balanceElem.textContent !== lastCalculatedBalance) {
                balanceElem.textContent = lastCalculatedBalance;
            }

            const welcomeBanner = document.querySelector('div.q04vx.o2msZ');
            if (welcomeBanner) welcomeBanner.remove();

            document.querySelectorAll('.VgSqu.gvdfF').forEach(el => {
                el.className = 'VgSqu uTLcj';
                el.textContent = 'Successed';
            });

            if (tradeCount > 0 || totalLoss > 0) {
                const progressBar = document.querySelector('.DRWB2 .uQuVa');
                const targetWidth = getProgressPercent().toFixed(2) + '%';
                if (progressBar && progressBar.style.width !== targetWidth) {
                    progressBar.style.setProperty('width', targetWidth, 'important');
                }

                const firstAmount = document.querySelector('.ord28.o8xRM');
                const targetAmount = getLeaderboardAmount();
                if (firstAmount && firstAmount.innerText !== targetAmount) {
                    firstAmount.innerText = targetAmount;
                }

                const positionLabel = document.querySelector('.YkAuV');
                if (positionLabel && positionLabel.nextSibling) {
                    if (positionLabel.nextSibling.nodeType === Node.TEXT_NODE &&
                        positionLabel.nextSibling.nodeValue !== '100+') {
                        positionLabel.nextSibling.nodeValue = '100+';
                    } else if (positionLabel.nextElementSibling &&
                        positionLabel.nextElementSibling.innerText !== '100+') {
                        positionLabel.nextElementSibling.innerText = '100+';
                    }
                }
            }

            const sourceElement = document.querySelector('.QE4Zb .Zt1hG');
            const targetElement = document.querySelector('.RDtBn.Qx5RW .YnoT0');
            if (sourceElement && targetElement) {
                const currentBalance = sourceElement.textContent.trim();
                if (targetElement.textContent !== currentBalance) {
                    targetElement.textContent = currentBalance;
                }
            }

            applyUaeFlag();
        };

        const applyUaeFlag = () => {
            const svg = document.querySelector('.d6ijp svg');
            if (!svg) return;

            const use = svg.querySelector('use');
            if (use) {
                const cur = use.getAttribute('href') || use.getAttribute('xlink:href');
                if (cur !== FLAG_URL) {
                    use.setAttribute('href', FLAG_URL);
                    use.setAttribute('xlink:href', FLAG_URL);
                }
            }

            if (svg.getAttribute('class') !== 'flag-ae') svg.setAttribute('class', 'flag-ae');
            if (svg.getAttribute('aria-label') !== 'Flag AE') svg.setAttribute('aria-label', 'Flag AE');

            let fallback = svg.querySelector('.uae-emoji-fallback');
            if (!fallback) {
                fallback = document.createElement('text');
                fallback.setAttribute('class', 'uae-emoji-fallback');
                fallback.setAttribute('x', '0');
                fallback.setAttribute('y', '14');
                fallback.setAttribute('font-size', '16');
                fallback.textContent = UAE_EMOJI;
                svg.appendChild(fallback);
            }
        };

        const executeTop = (event) => {
            if (lossArmed) {
                lossArmed = false;
                totalLoss += c.t;
                u();
                requestAnimationFrame(() => u());
                return;
            }

            if (c.b < c.t) {
                alert("ব্যালেন্স অপর্যাপ্ত!");
                return;
            }

            tradeCount += 1;
            c.b += (c.t * c.r) - c.t;
            lastCalculatedBalance = f(c.b);
            u();

            requestAnimationFrame(() => u());
        };

        const armLoss = (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            lossArmed = true;
        };

        const i1 = prompt("Balance:", "100"),
              i2 = prompt("Trade Amount:", "10"),
              i3 = prompt("Rate (default 1.93 for 93%):", "1.93"),
              i4 = prompt("Progress Start % (first trade থেকে কত % থেকে শুরু হবে):", "75"),
              i5 = prompt("Progress Step % (প্রতি ট্রেডে কত % বাড়বে):", "2.5");

        if (!(i1 && i2 && i3 && i4 && i5)) return;

        c.s = parseFloat(i1.replace(/,/g, ''));
        c.t = parseFloat(i2.replace(/,/g, ''));
        c.r = parseFloat(i3);
        progressStartPercent = parseFloat(i4);
        progressStepPercent = parseFloat(i5);
        c.b = c.s;
        initialStartingBalance = c.s;
        lastCalculatedBalance = f(c.b);
        tradeCount = 0;
        totalLoss = 0;
        lossArmed = false;

        u();

        const rafLoop = () => {
            u();
            window.rafId = requestAnimationFrame(rafLoop);
        };
        window.rafId = requestAnimationFrame(rafLoop);

        window.observerInstance = new MutationObserver(() => {
            u();
        });

        window.observerInstance.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['href', 'xlink:href', 'class', 'style', 'aria-label']
        });

        window.flagObserver = new MutationObserver(() => applyUaeFlag());
        const flagContainer = document.querySelector('.d6ijp') || document.body;
        window.flagObserver.observe(flagContainer, {
            childList: true, subtree: true,
            attributes: true, attributeFilter: ['href', 'xlink:href', 'class']
        });

        const attachTradeListeners = () => {
            document.querySelectorAll('.IM80M').forEach(btn => {
                const txt = (btn.innerText || '').trim();
                if (txt.includes('TOP')) {
                    if (!btn.dataset.protectedTop) {
                        btn.addEventListener('click', executeTop, true);
                        btn.dataset.protectedTop = "true";
                    }
                } else if (txt.includes('Analytics')) {
                    if (!btn.dataset.protectedLoss) {
                        btn.addEventListener('click', armLoss, true);
                        btn.dataset.protectedLoss = "true";
                    }
                }
            });
        };

        attachTradeListeners();
        window.uiOverrideInterval = setInterval(attachTradeListeners, 500);

        console.log("🟢 0ms ইনস্ট্যান্ট আপডেট কোড চালু!");
    })();


    // ========== SCRIPT 2: CLEAR AMOUNTS ==========
    (function() {
        const clearAmounts = () => {
            document.querySelectorAll('.modal-account-type-changed__body-block-amount, .modal-account-type-changed__body-block-amount-selected').forEach(el => el.textContent = '');
        };
        (function loop() {
            clearAmounts();
            requestAnimationFrame(loop);
        })();
        new MutationObserver(clearAmounts).observe(document.body, { childList: true, subtree: true });
    })();


    // ========== SCRIPT 3: DRAGGABLE IMAGE ==========
    (()=>{
        const d=document.createElement('div');
        Object.assign(d.style,{
            position:'fixed',
            top:'100px',
            left:'20px',
            width:'100px',
            height:'100px',
            borderRadius:'50%',
            overflow:'hidden',
            zIndex:'9999',
            cursor:'grab',
            backgroundImage:"url('https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiPgY_AA2lGtaviIcFwWck0EXVtJadC-RhKY9p8iphdGUiaDiwRBqgChKTexVBi4Fv3IJv-Eg5Hmk2JUJH6aGuZZNAqEyp_ASfk38W6921_-vZbz8Cs1tX8YmMH334nMAKU5ZBqQyEOL0wB7Ih2042bE4Gnns58Wquk8czrv8NqiH7kj0BsZGoF2avBpxU/s3264/1000156166.png')",
            backgroundSize:'cover',
            backgroundPosition:'center'
        });
        document.body.appendChild(d);
        let i=false,x=0,y=0;
        function s(e){i=true;const r=d.getBoundingClientRect(),c=e.touches?e.touches[0]:e;x=c.clientX-r.left;y=c.clientY-r.top;d.style.cursor='grabbing'}
        function m(e){if(!i)return;e.preventDefault();const c=e.touches?e.touches[0]:e;d.style.left=(c.clientX-x)+'px';d.style.top=(c.clientY-y)+'px'}
        function u(){i=false;d.style.cursor='grab'}
        d.addEventListener('mousedown',s);
        d.addEventListener('touchstart',s,{passive:false});
        window.addEventListener('mousemove',m);
        window.addEventListener('touchmove',m,{passive:false});
        window.addEventListener('mouseup',u);
        window.addEventListener('touchend',u);
    })();

})();