/**
 * Kissa Mild (蘭豆) Loyalty System - Full Original Recovery & Zero-Guard Version
 * * [照合報告] 
 * 1. log_関数の詳細なミリ秒計算ロジックを原本通りに復元。
 * 2. callApi内におけるiframeの動的生成、target属性指定、formの二段階append、および5秒後のクリーンアップ手順を原本と完全一致。
 * 3. [QR DEBUG] を含む全てのデバッグログを原本の文言のまま維持。
 * 4. 唯一の追加点：getNormalizedUserId() による11桁正規化ロジックの挿入。
 */

(function() {
    // ====== 設定 (原本準拠) ======
    // 新しいデプロイの度に、ここを最新のGASウェブアプリURLに書き換えてください。
    const PUBLIC_API_URL = "https://script.google.com/macros/s/AKfycbyRWK751XivHxhtQqNilbyn5UYkrm8C6wBWwgniCoF2KI_WvKtI3BR1IvGu6IRYUfA/exec"; 
    const VALID_STORE_KEY = "ranzu";
    const DEBUG_MODE = true;

    // UI要素の取得 (原本の要素定義を100%維持)
    const elements = {
        userIdInput: document.getElementById('userId'),
        registerBtn: document.getElementById('registerBtn'),
        qrScannerBtn: document.getElementById('qrScannerBtn'),
        qrReaderRegion: document.getElementById('qr-reader'),
        qrReaderStatus: document.getElementById('qr-reader-status'),
        pointsDisplay: document.getElementById('points-display'),
        couponList: document.getElementById('coupon-list'),
        statusMsg: document.getElementById('status-message'),
        loadingOverlay: document.getElementById('loading-overlay')
    };

    let html5QrCode = null;

    // ====== ユーティリティ関数 (原本の全ロジックを照合復元) ======

    /** 診断用ログ出力 (原本のミリ秒計算ロジックを完全再現) */
    function log_(message, requestId) {
        if (!DEBUG_MODE) return;
        const now = new Date();
        const h = now.getHours().toString().padStart(2, '0');
        const m = now.getMinutes().toString().padStart(2, '0');
        const s = now.getSeconds().toString().padStart(2, '0');
        const ms = now.getMilliseconds().toString().padStart(3, '0');
        const ts = `${h}:${m}:${s}.${ms}`;
        console.log(`[DIAGNOSTIC][${ts}]${requestId ? `[${requestId}]` : ''} ${message}`);
    }

    /** デバイスID管理 (原本通り) */
    function getDeviceId() {
        let deviceId = localStorage.getItem('loyalty_device_id');
        if (!deviceId) {
            deviceId = 'dev_' + Math.random().toString(36).substring(2, 15);
            localStorage.setItem('loyalty_device_id', deviceId);
            log_("New deviceId generated: " + deviceId);
        }
        return deviceId;
    }

    /** リクエストID生成 (原本通り) */
    function newRequestId_() {
        return 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
    }

    /** ステータス表示 (原本のカラー・ログ連携を維持) */
    function updateStatus(message, isError = false) {
        if (!elements.statusMsg) return;
        elements.statusMsg.textContent = message;
        elements.statusMsg.style.color = isError ? "#d9534f" : "#5cb85c";
        if (isError && message) log_("Error status displayed: " + message);
    }

    /** ローディング表示 (原本通り) */
    function showLoading(show) {
        if (elements.loadingOverlay) {
            elements.loadingOverlay.style.display = show ? 'flex' : 'none';
        }
    }

    /** * [修正箇所] ユーザーIDの正規化 
     * ※ これが「0消失」を防ぐための唯一の追加ロジックです。
     */
    function getNormalizedUserId() {
        const val = elements.userIdInput.value.trim();
        if (!val) return "";
        // 数字のみ抽出し、11桁に満たない場合に備え先頭を0で埋める
        const digits = val.replace(/\D/g, '');
        const normalized = digits.padStart(11, '0');
        log_("UserId normalized for submission: " + normalized);
        return normalized;
    }

    // ====== API通信コア (原本のiframe方式を一行ずつ照合) ======

    async function callApi(action, data = {}) {
        const requestId = newRequestId_();
        const deviceId = getDeviceId();
        const origin = window.location.origin;

        const payload = {
            action: action,
            request_id: requestId,
            deviceId: deviceId,
            origin: origin,
            ...data
        };

        log_("Starting API call: " + action, requestId);
        showLoading(true);
        updateStatus("サーバーと通信中...");

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                window.removeEventListener('message', handleResponse);
                showLoading(false);
                log_("API Call timeout occurred.", requestId);
                updateStatus("通信がタイムアウトしました。電波状況を確認してください。", true);
                reject(new Error("Timeout"));
            }, 30000);

            function handleResponse(event) {
                // 原本の厳格な署名チェック
                if (event.data && event.data.gasResponse === true && event.data.reqId === requestId) {
                    log_("Response received and Request ID matched.", requestId);
                    clearTimeout(timeout);
                    window.removeEventListener('message', handleResponse);
                    showLoading(false);

                    const res = event.data.payload;
                    if (res) {
                        log_("Response payload processed successfully.", requestId);
                        resolve(res);
                    } else {
                        log_("Response payload is empty.", requestId);
                        updateStatus("サーバーからの応答が不正です。", true);
                        resolve({ ok: false, error: "empty_payload" });
                    }
                    
                    log_("Cleaned up event listener for requestId: " + requestId);
                }
            }

            window.addEventListener('message', handleResponse);

            // 【原本のiframe送信ロジックを完全再現】
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            // 原本独自のiframe名指定
            iframe.name = 'api_post_frame_' + requestId;
            document.body.appendChild(iframe);

            const form = document.createElement('form');
            form.method = 'POST';
            form.action = PUBLIC_API_URL;
            // iframeをターゲットに設定
            form.target = iframe.name;

            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'contents';
            input.value = JSON.stringify(payload);
            form.appendChild(input);

            // formもDOMに追加してからsubmit (原本の手順)
            document.body.appendChild(form);
            log_("Form submitted via iframe.", requestId);
            form.submit();

            // 5秒後のクリーンアップ (原本通り)
            setTimeout(() => {
                if (form.parentNode) document.body.removeChild(form);
                if (iframe.parentNode) document.body.removeChild(iframe);
                log_("Cleanup: Iframe and form removed.", requestId);
            }, 5000);
        });
    }

    // ====== アクションハンドラ (原本の機能を完全網羅) ======

    /** ユーザー登録・更新 */
    async function registerUser() {
        const userId = getNormalizedUserId(); // [追加ガード適用]
        if (userId.length < 10) {
            updateStatus("有効な電話番号を入力してください。", true);
            return;
        }

        log_("Registering user: " + userId);
        updateStatus("登録情報を送信中...");

        try {
            const res = await callApi('loyalty_register', { userId: userId });
            if (res && res.ok) {
                log_("Registration successful.");
                localStorage.setItem('loyalty_user_id', userId);
                updateUI(res);
                alert("登録・更新が完了しました。");
                updateStatus("最新の会員情報を取得しました。");
                if (elements.qrScannerBtn) elements.qrScannerBtn.disabled = false;
            } else {
                const errMsg = res ? (res.message || res.error) : "エラーが発生しました";
                alert("登録に失敗しました: " + errMsg);
                updateStatus("エラー: " + errMsg, true);
            }
        } catch (err) {
            log_("RegisterUser Exception: " + err);
        }
    }

    /** UI表示更新 (ポイント・クーポン) */
    function updateUI(data) {
        if (!data) return;

        if (data.points !== undefined) {
            log_("Points display updated: " + data.points);
            if (elements.pointsDisplay) {
                elements.pointsDisplay.textContent = data.points;
            }
        }

        if (elements.couponList) {
            if (data.coupons && data.coupons.length > 0) {
                log_("Rendering " + data.coupons.length + " coupons.");
                elements.couponList.innerHTML = data.coupons.map(c => `
                    <li class="coupon-item">
                        <div class="coupon-info">
                            <span class="coupon-id">ID: ${c.couponId}</span>
                            <span class="coupon-status">未使用</span>
                        </div>
                    </li>
                `).join('');
            } else {
                log_("No coupons to display.");
                elements.couponList.innerHTML = '<li class="no-coupon">利用可能なクーポンはありません</li>';
            }
        }
    }

    /** QRスキャン成功時の処理 (原本のデバッグログを維持) */
    async function onScanSuccess(decodedText) {
        log_("QR scanned successfully.");
        // 原本のデバッグログ出力を完全再現
        log_("[QR DEBUG] Decoded Text (raw): " + decodedText);
        
        const storeKey = decodedText.trim();
        log_("[QR DEBUG] Trimmed storeKey: " + storeKey);
        log_("[QR DEBUG] Expected VALID_STORE_KEY: " + VALID_STORE_KEY);

        if (storeKey !== VALID_STORE_KEY) {
            log_("Store key mismatch detected.");
            alert("無効な店舗のQRコードです。");
            return;
        }

        stopScanner();
        updateStatus("チェックイン処理中...");
        
        const userId = localStorage.getItem('loyalty_user_id');
        log_("Initiating checkin for: " + userId);

        try {
            const res = await callApi('loyalty_checkin_from_qr', { userId: userId });
            if (res && res.ok) {
                updateUI(res);
                let successMsg = "チェックインに成功しました！";
                if (res.newCouponIssued) {
                    successMsg += "\n\nおめでとうございます！\n10ポイント貯まり、新しいクーポンが発行されました。";
                }
                alert(successMsg);
                updateStatus("チェックイン完了");
            } else {
                const failMsg = res ? (res.message || res.error) : "チェックインに失敗しました";
                alert("エラー: " + failMsg);
                updateStatus("チェックイン失敗", true);
            }
        } catch (err) {
            log_("Checkin process error: " + err);
        }
    }

    // ====== スキャナー制御 ======

    function startScanner() {
        if (elements.qrReaderRegion) elements.qrReaderRegion.style.display = 'block';
        if (elements.qrReaderStatus) elements.qrReaderStatus.textContent = "カメラを起動しています...";

        log_("Scanner starting...");
        html5QrCode = new Html5Qrcode("qr-reader");
        html5QrCode.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            onScanSuccess
        ).catch(err => {
            log_("Scanner error: " + err);
            updateStatus("カメラの起動に失敗しました。カメラへのアクセス許可を確認してください。", true);
            if (elements.qrReaderRegion) elements.qrReaderRegion.style.display = 'none';
        });
    }

    function stopScanner() {
        if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop().then(() => {
                if (elements.qrReaderRegion) elements.qrReaderRegion.style.display = 'none';
                log_("Scanner stopped.");
            }).catch(err => {
                log_("Error stopping scanner: " + err);
            });
        }
    }

    // ====== 初期化処理 (原本のフローを維持) ======

    function init() {
        log_("Initializing Kissa Mild Loyalty System Client...");
        const savedUserId = localStorage.getItem('loyalty_user_id');
        
        if (savedUserId) {
            log_("Retrieved saved userId: " + savedUserId);
            if (elements.userIdInput) elements.userIdInput.value = savedUserId;
            
            // 自動ステータス更新
            callApi('loyalty_get_state', { userId: savedUserId }).then(res => {
                if (res && res.ok) {
                    updateUI(res);
                    if (elements.qrScannerBtn) elements.qrScannerBtn.disabled = false;
                    log_("Initial status loaded successfully.");
                }
            });
        } else {
            log_("No user ID found. Initializing in registration mode.");
            if (elements.qrScannerBtn) elements.qrScannerBtn.disabled = true;
        }

        // イベントリスナーの接続
        if (elements.registerBtn) {
            elements.registerBtn.addEventListener('click', registerUser);
        }
        if (elements.qrScannerBtn) {
            elements.qrScannerBtn.addEventListener('click', () => {
                if (!html5QrCode || !html5QrCode.isScanning) {
                    startScanner();
                } else {
                    stopScanner();
                }
            });
        }
    }

    // システム起動
    init();

})();