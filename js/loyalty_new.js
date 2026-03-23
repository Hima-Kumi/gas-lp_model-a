// ============================================================
// Loyalty Program Logic (New, hashchange-based communication)
// ============================================================
(function() {
  'use strict';

  // ============================================================
  // Configuration
  // ============================================================
  const PUBLIC_API_URL = "https://script.google.com/macros/s/AKfycbxWOt31hryq8yYLhv65pfhpMCuoDicnh8Kx8qmmoJDQPGi3_jWznNhpRduuvL_MmTwO/exec";
  const SITE_KEY = "model-a";
  const LS_DEVICE_ID_KEY = "loyaltyDeviceId";
  const LS_USER_ID_KEY = "loyaltyUserId";
  const VALID_STORE_KEY = "ranzu";

  // ============================================================
  // State
  // ============================================================
  let loyaltyState = {
    deviceId: null,
    userId: null,
    points: 0,
    coupons: [],
    isLoading: false,
  };
  let html5QrCode = null;

  // ============================================================
  // DOM Elements
  // ============================================================
  const getEl = (id) => document.getElementById(id);
  const elements = {
    // Modal
    backdrop: getEl('loyBackdrop'),
    modal: getEl('loyModal'),
    openBtn: getEl('openLoyalty'),
    closeBtn: getEl('loyClose'),
    // Tabs
    tabPoint: getEl('tabPoint'),
    tabCoupon: getEl('tabCoupon'),
    tabHowto: getEl('tabHowto'),
    panePoint: getEl('panePoint'),
    paneCoupon: getEl('paneCoupon'),
    paneHowto: getEl('paneHowto'),
    // Point Pane
    userIdInput: getEl('loyaltyUserId'),
    registerBtn: getEl('loyaltyRegisterBtn'),
    pointsDisplay: getEl('loyaltyPoints'),
    progressSpan: getEl('loyaltyProgress')?.querySelector('span'),
    startQrScanBtn: getEl('startQrScanBtn'),
    // Coupon Pane
    couponList: getEl('loyaltyCouponList'),
    // Scanner UI
    qrScannerUi: getEl('qrScannerUi'),
    qrReader: getEl('qr-reader'),
    qrReaderStatus: getEl('qr-reader-status'),
    closeQrScannerBtn: getEl('closeQrScanner'),
  };

  // ============================================================
  // API Communication (hashchange method)
  // ============================================================

  function newClientRequestId_(){
    try { 
      if (window.crypto && window.crypto.randomUUID) {
        return window.crypto.randomUUID();
      }
    } catch(e){}
    return "req_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function callApiWithResponse(action, payload = {}) {
    console.log(`%c[DIAGNOSTIC] Preparing API call (hashchange method)...`, 'color: blue;', { action, payload });

    return new Promise((resolve, reject) => {
      if (loyaltyState.isLoading) {
        console.warn('%c[DIAGNOSTIC] API call blocked: another request is in progress.', 'color: orange;');
        return reject(new Error("前の処理が完了するまでお待ちください。"));
      }
      loyaltyState.isLoading = true;

      const requestId = newClientRequestId_();
      const iframeName = "gas_target_" + requestId;
      let form, iframe;
      
      console.log(`%c[DIAGNOSTIC] Starting API call. Waiting for hashchange.`, 'color: blue; font-weight: bold;', { action, requestId });

      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        
        console.log(`%c[DIAGNOSTIC] Cleaning up for requestId: ${requestId}`, 'color: gray;');
        window.removeEventListener('hashchange', handleHashChange);
        
        if (window.location.hash.startsWith('#gas_response=')) {
          history.replaceState(null, '', window.location.pathname + window.location.search);
        }

        clearTimeout(timeoutId);
        
        if (form && form.parentNode) form.parentNode.removeChild(form);
        if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
        
        loyaltyState.isLoading = false;
      };

      const handleHashChange = () => {
        const hash = window.location.hash;
        console.log(`%c[DIAGNOSTIC] hashchange event detected. Hash: ${hash}`, 'color: green;');

        if (!hash.startsWith('#gas_response=')) {
          console.log('[DIAGNOSTIC] ...but it is not a gas_response hash. Ignoring.');
          return;
        }

        const urlSafeBase64 = hash.substring('#gas_response='.length);
        
        try {
          let base64 = urlSafeBase64.replace(/-/g, '+').replace(/_/g, '/');
          while (base64.length % 4) {
            base64 += '=';
          }
          const binaryString = atob(base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
          }
          const decoder = new TextDecoder('utf-8');
          const jsonPayloadString = decoder.decode(bytes);
          const data = JSON.parse(jsonPayloadString);

          console.log(`%c[DIAGNOSTIC] Decoded hash data:`, 'color: green;', data);

          if (data && data.request_id === requestId) {
            console.log(`%c[DIAGNOSTIC] Request ID MATCHED! requestId: ${requestId}`, 'color: green; font-weight: bold;');
            cleanup();
            if (data.ok) {
              resolve(data);
            } else {
              const serverError = new Error(data.message || data.error || 'API Error');
              serverError.stack = data.stack;
              reject(serverError);
            }
          } else {
            console.warn(`%c[DIAGNOSTIC] Request ID MISMATCH.`, 'color: orange;', {
              expected: requestId,
              received: data ? data.request_id : 'N/A'
            });
          }
        } catch (e) {
          console.error(`%c[DIAGNOSTIC] Failed to parse response from hash.`, 'color: red;', e);
          cleanup();
          reject(new Error('サーバーからの応答の解析に失敗しました。'));
        }
      };

      const timeoutId = setTimeout(() => {
        console.error(`%c[DIAGNOSTIC] API call TIMEOUT for requestId: ${requestId}`, 'color: red; font-weight: bold;');
        cleanup();
        reject(new Error("サーバーからの応答がありませんでした (30秒タイムアウト)。"));
      }, 30000);

      window.addEventListener('hashchange', handleHashChange);

      try {
        iframe = document.createElement('iframe');
        iframe.name = iframeName;
        iframe.style.display = 'none';
        document.body.appendChild(iframe);

        form = document.createElement('form');
        form.method = 'POST';
        form.action = PUBLIC_API_URL;
        form.target = iframeName;

        const fields = {
          action,
          key: SITE_KEY,
          origin: location.origin || '*',
          request_id: requestId,
          deviceId: loyaltyState.deviceId,
          ...payload
        };

        for (const key in fields) {
          if (fields[key] !== undefined) {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = key;
            input.value = fields[key];
            form.appendChild(input);
          }
        }
        document.body.appendChild(form);
        form.submit();
      } catch (e) {
        reject(e);
        cleanup();
      }
    });
  }

  // ============================================================
  // UI and State Logic
  // ============================================================

  function updateLoyaltyUI() {
    if (!elements.modal) return;

    if (elements.userIdInput) {
      elements.userIdInput.value = loyaltyState.userId || '';
      elements.userIdInput.readOnly = !!loyaltyState.userId;
    }
    
    const points = loyaltyState.points || 0;
    if (elements.pointsDisplay) {
      elements.pointsDisplay.textContent = `ポイント: ${points} / 10`;
    }
    if (elements.progressSpan) {
      const percentage = Math.min(100, (points / 10) * 100);
      elements.progressSpan.style.width = `${percentage}%`;
    }

    if (elements.startQrScanBtn) {
        elements.startQrScanBtn.disabled = !loyaltyState.userId;
    }

    if (elements.couponList) {
        if (loyaltyState.isLoading && loyaltyState.coupons.length === 0) { 
            elements.couponList.innerHTML = '<p class="muted">読み込んでいます...</p>';
        } else if (loyaltyState.coupons && loyaltyState.coupons.length > 0) {
            elements.couponList.innerHTML = '';
            loyaltyState.coupons.forEach(coupon => {
                const couponEl = document.createElement('div');
                couponEl.className = 'loy-coupon-card';
                couponEl.innerHTML = `
                    <strong>特典クーポン</strong>
                    <p>この画面を店員に提示してください。</p>
                    <small>発行日時: ${new Date(coupon.issuedAt).toLocaleString()}</small>
                    <button class="loy-btn primary use-coupon-btn" data-coupon-id="${coupon.couponId}">使用する</button>
                `;
                elements.couponList.appendChild(couponEl);
            });
        } else {
            elements.couponList.innerHTML = '<p class="muted">利用可能なクーポンはありません。</p>';
        }
    }
  }

  function updateLoyaltyState(apiResponse) {
    loyaltyState.points = apiResponse.points || 0;
    loyaltyState.coupons = apiResponse.coupons || [];
    if (apiResponse.userId) {
        loyaltyState.userId = apiResponse.userId;
        localStorage.setItem(LS_USER_ID_KEY, apiResponse.userId);
    }
    updateLoyaltyUI();
  }

  // ============================================================
  // Event Handlers
  // ============================================================

  function handleRegister() {
    const userId = elements.userIdInput.value.trim();
    if (!userId) {
      alert("電話番号またはメールアドレスを入力してください。");
      return;
    }

    elements.registerBtn.disabled = true;
    elements.registerBtn.textContent = "処理中...";

    callApiWithResponse('loyalty_register', { userId: userId })
      .then(response => {
        if (response && response.ok) {
            alert("登録/更新が完了しました。QRスキャンボタンでチェックインできます。");
            updateLoyaltyState(response);
        } else {
            alert("登録/更新に失敗しました: " + (response.message || "不明なエラー"));
        }
      })
      .catch(error => {
        alert("登録/更新中にエラーが発生しました: " + error.message);
      })
      .finally(() => {
        elements.registerBtn.disabled = false;
        elements.registerBtn.textContent = "登録/更新";
      });
  }

  function startQrScanner() {
    if (!loyaltyState.userId) {
        alert("先に「登録/更新」ボタンでユーザー登録を完了してください。");
        elements.userIdInput?.focus();
        return;
    }
    if (!elements.qrScannerUi || typeof Html5Qrcode === "undefined") {
      alert("QRスキャナの読み込みに失敗しました。ページを再読み込みしてください。");
      return;
    }

    elements.qrScannerUi.style.display = 'block';
    if (elements.qrReaderStatus) elements.qrReaderStatus.textContent = "カメラを起動中...";

    if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("qr-reader");
    }

    const qrCodeSuccessCallback = (decodedText, decodedResult) => {
      stopQrScanner();
      if(elements.qrReaderStatus) elements.qrReaderStatus.textContent = "コードを検証中...";

      let storeKey = '';
      try {
        const url = new URL(decodedText);
        storeKey = url.searchParams.get('store');
      } catch (e) {
        alert("無効なQRコードです。（URL形式ではありません）");
        return;
      }

      if (storeKey !== VALID_STORE_KEY) {
        alert(`無効な店舗のQRコードです。`);
        return;
      }

      callApiWithResponse("loyalty_checkin_from_qr", { userId: loyaltyState.userId })
        .then(result => {
          if (result && result.ok) {
            alert(`チェックインしました！
現在のポイント: ${result.points}p` + (result.newCouponIssued ? "

新しいクーポンが発行されました！" : ""));
            updateLoyaltyState(result);
          } else {
            const errorMessage = "チェックインエラー: " + (result?.message || result?.error || "不明なエラー");
            alert(errorMessage);
          }
        })
        .catch(err => {
          const criticalError = "チェックインに失敗しました: " + err.message;
          alert(criticalError);
        });
    };

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrCode.start({ facingMode: "environment" }, config, qrCodeSuccessCallback)
      .catch(err => {
        console.error("Unable to start scanning.", err);
        if (elements.qrReaderStatus) elements.qrReaderStatus.textContent = "カメラの起動に失敗しました。";
      });
  }

  function stopQrScanner() {
    if (html5QrCode && html5QrCode.isScanning) {
      html5QrCode.stop().then(() => {
        console.log("QR Code scanning stopped.");
      }).catch(err => {
        console.error("Failed to stop QR scanner.", err);
      }).finally(() => {
        html5QrCode = null;
        if (elements.qrScannerUi) elements.qrScannerUi.style.display = 'none';
      });
    } else if (elements.qrScannerUi) {
      elements.qrScannerUi.style.display = 'none';
    }
  }

  // ============================================================
  // Initializer
  // ============================================================
  function init() {
    // Clean up hash from previous failed attempts if any
    if (window.location.hash.startsWith('#gas_response=')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    let deviceId = localStorage.getItem(LS_DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = self.crypto?.randomUUID ? self.crypto.randomUUID() : `dev_${Date.now()}_${Math.random()}`;
      localStorage.setItem(LS_DEVICE_ID_KEY, deviceId);
    }
    loyaltyState.deviceId = deviceId;

    const userId = localStorage.getItem(LS_USER_ID_KEY);
    if (userId) {
      loyaltyState.userId = userId;
      callApiWithResponse('loyalty_get_state', { userId: loyaltyState.userId })
        .then(updateLoyaltyState)
        .catch(err => console.error("Initial state fetch failed", err));
    }
    updateLoyaltyUI();

    // Setup Modal Listeners
    elements.openBtn?.addEventListener('click', () => {
      elements.backdrop.style.display = 'block';
      elements.modal.style.display = 'block';
    });
    const closeLoy = () => {
      elements.backdrop.style.display = 'none';
      elements.modal.style.display = 'none';
    };
    elements.closeBtn?.addEventListener('click', closeLoy);
    elements.backdrop?.addEventListener('click', closeLoy);
    
    // Setup Tab Listeners
    const tabs = [
      [elements.tabPoint, elements.panePoint],
      [elements.tabCoupon, elements.paneCoupon],
      [elements.tabHowto, elements.paneHowto]
    ];
    tabs.forEach(([tab, pane]) => {
      tab?.addEventListener('click', () => {
        tabs.forEach(([t, p]) => {
          t?.setAttribute('aria-selected', t === tab ? 'true' : 'false');
          p?.classList.toggle('active', p === pane);
        });
      });
    });

    // Setup Action Listeners
    elements.registerBtn?.addEventListener('click', handleRegister);
    elements.startQrScanBtn?.addEventListener('click', startQrScanner);
    elements.closeQrScannerBtn?.addEventListener('click', stopQrScanner);
  }

  // Run initializer on load
  window.addEventListener('load', init);

})();
