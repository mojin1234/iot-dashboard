const App = {
    state: {
        temp: 0, humidity: 0, light: 0, co2: 0,
        fan: false, jsq: false, led: false, beep: false,
        app_mode: 1,
        temp_f: 30, humi_f: 45, light_f: 15, co2_f: 65,
        online: false,
        historyData: []
    },

    _controlLock: {},
    _CONTROL_LOCK_DURATION: 15000,

    gaugeConfigs: {
        temp: { max: 50, color: '#e74c3c', label: '温度', unit: '°C', icon: '🌡' },
        humidity: { max: 100, color: '#3498db', label: '湿度', unit: '%', icon: '💧' },
        light: { max: 100, color: '#f39c12', label: '光照', unit: 'lux', icon: '☀' },
        co2: { max: 100, color: '#9b59b6', label: 'CO2', unit: 'ppm', icon: '🏭' }
    },

    circumference: 2 * Math.PI * 42,

    getDb() {
        return supabaseClient;
    },

    init() {
        console.log('[DEBUG] App.init() 开始初始化');
        this.checkAuth().then(() => {
            this.renderSensors();
            this.bindEvents();
            this.loadLatestData();
            this.subscribeRealtime();
            this.loadHistory();
            console.log('[DEBUG] App.init() 初始化完成');
        });
    },

    async checkAuth() {
        const { data: { session } } = await this.getDb().auth.getSession();
        if (!session) {
            window.location.href = 'login.html';
            return;
        }
        
        const userEmail = session.user.email;
        document.getElementById('user-email').textContent = userEmail;
        
        this.getDb().auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                window.location.href = 'login.html';
            }
        });
    },

    async logout() {
        const { error } = await this.getDb().auth.signOut();
        if (!error) {
            window.location.href = 'login.html';
        }
    },

    renderSensors() {
        const grid = document.getElementById('sensor-grid');
        const colorMap = {
            temp: 'color-temp', humidity: 'color-humi', light: 'color-light',
            co2: 'color-co2'
        };

        grid.innerHTML = Object.entries(this.gaugeConfigs).map(([key, cfg]) => `
            <div class="sensor-card ${colorMap[key]}" id="card-${key}">
                <div class="gauge">
                    <svg viewBox="0 0 100 100">
                        <circle class="gauge-bg" cx="50" cy="50" r="42"/>
                        <circle class="gauge-fill" cx="50" cy="50" r="42"
                            stroke="${cfg.color}"
                            stroke-dasharray="${this.circumference}"
                            stroke-dashoffset="${this.circumference}"
                            id="gauge-${key}"/>
                    </svg>
                    <div class="gauge-value">
                        <div class="gauge-number" id="gauge-num-${key}">0</div>
                        <div class="gauge-unit">${cfg.unit}</div>
                    </div>
                </div>
                <div class="sensor-info">
                    <div class="sensor-name">${cfg.icon} ${cfg.label}</div>
                    <div class="sensor-val" id="val-${key}">0</div>
                    <div class="sensor-range">范围: 0 ~ ${cfg.max} ${cfg.unit}</div>
                </div>
            </div>
        `).join('');
    },

    updateGauge(key, value) {
        const cfg = this.gaugeConfigs[key];
        const pct = Math.min(value / cfg.max, 1);
        const offset = this.circumference * (1 - pct);

        const gaugeEl = document.getElementById(`gauge-${key}`);
        const numEl = document.getElementById(`gauge-num-${key}`);
        const valEl = document.getElementById(`val-${key}`);

        if (gaugeEl) gaugeEl.style.strokeDashoffset = offset;
        if (numEl) numEl.textContent = value;
        if (valEl) valEl.textContent = value + cfg.unit;
    },

    updateAllSensors() {
        Object.keys(this.gaugeConfigs).forEach(key => {
            this.updateGauge(key, this.state[key]);
        });
    },

    updateDeviceControls() {
        console.log('[DEBUG] updateDeviceControls() 更新设备控制UI, 当前state:', {
            fan: this.state.fan, jsq: this.state.jsq, led: this.state.led,
            app_mode: this.state.app_mode
        });
        document.getElementById('switch-fan').checked = this.state.fan;
        document.getElementById('switch-jsq').checked = this.state.jsq;
        document.getElementById('switch-led').checked = this.state.led;

        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active',
                btn.dataset.mode === String(this.state.app_mode));
        });

        this.updateDeviceStatusText();
    },

    updateDeviceStatusText() {
        document.getElementById('fan-status').textContent = this.state.fan ? '运行中' : '已关闭';
        document.getElementById('jsq-status').textContent = this.state.jsq ? '运行中' : '已关闭';
        document.getElementById('led-status').textContent = this.state.led ? '已开启' : '已关闭';
        document.getElementById('beep-status').textContent = this.state.beep ? '报警中' : '已关闭';
    },

    updateThresholdInputs() {
        console.log('[DEBUG] updateThresholdInputs() 更新阈值输入框:', {
            temp_f: this.state.temp_f, humi_f: this.state.humi_f,
            light_f: this.state.light_f, co2_f: this.state.co2_f
        });
        document.getElementById('threshold-temp').value = this.state.temp_f;
        document.getElementById('threshold-humi').value = this.state.humi_f;
        document.getElementById('threshold-light').value = this.state.light_f;
        document.getElementById('threshold-co2').value = this.state.co2_f;
    },

    updateOnlineStatus(online) {
        this.state.online = online;
        const dot = document.getElementById('status-dot');
        const text = document.getElementById('status-text');
        if (online) {
            dot.classList.remove('offline');
            text.textContent = '设备在线';
        } else {
            dot.classList.add('offline');
            text.textContent = '设备离线';
        }
    },

    isControlLocked(key) {
        return this._controlLock[key] && (Date.now() - this._controlLock[key] < this._CONTROL_LOCK_DURATION);
    },

    lockControl(key) {
        this._controlLock[key] = Date.now();
        console.log('[DEBUG] lockControl() 锁定控制属性:', key, ', 持续', this._CONTROL_LOCK_DURATION, 'ms');
    },

    bindEvents() {
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                var newMode = parseInt(btn.dataset.mode);
                console.log('[DEBUG] 模式按钮点击, 新模式:', newMode, '(0=自动, 1=手动)');
                this.state.app_mode = newMode;
                this.updateDeviceControls();
                this.sendSingleControl('APP_Mode', newMode === 1);
            });
        });

        ['fan', 'jsq', 'led'].forEach(device => {
            document.getElementById(`switch-${device}`).addEventListener('change', (e) => {
                console.log('[DEBUG] 设备开关切换:', device, '→', e.target.checked);
                this.state[device] = e.target.checked;
                this.updateDeviceStatusText();
                this.sendSingleControl(device.toUpperCase(), e.target.checked);
            });
        });

        document.getElementById('btn-save-threshold').addEventListener('click', () => {
            this.state.temp_f = parseInt(document.getElementById('threshold-temp').value) || 30;
            this.state.humi_f = parseInt(document.getElementById('threshold-humi').value) || 45;
            this.state.light_f = parseInt(document.getElementById('threshold-light').value) || 15;
            this.state.co2_f = parseInt(document.getElementById('threshold-co2').value) || 65;
            console.log('[DEBUG] 保存阈值按钮点击, 阈值:', {
                temp_f: this.state.temp_f, humi_f: this.state.humi_f,
                light_f: this.state.light_f, co2_f: this.state.co2_f
            });
            this.saveThreshold();
        });

        document.querySelectorAll('.history-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.history-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.loadHistory(tab.dataset.range);
            });
        });

        document.querySelectorAll('.nav-item[data-page]').forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                this.handleNavClick(page);
            });
        });

        this.initQueryDefaults();
        document.getElementById('btn-query-history').addEventListener('click', () => this.queryHistory());
        document.getElementById('btn-export-csv').addEventListener('click', () => this.exportCSV());
        
        document.getElementById('btn-logout').addEventListener('click', () => this.logout());
        
        document.getElementById('btn-settings').addEventListener('click', () => this.openSettings());
        document.getElementById('modal-close').addEventListener('click', () => this.closeSettings());
        document.getElementById('modal-confirm').addEventListener('click', () => this.closeSettings());
        document.getElementById('settings-modal').addEventListener('click', (e) => {
            if (e.target.id === 'settings-modal') this.closeSettings();
        });
        document.getElementById('btn-change-password').addEventListener('click', () => this.changePassword());
    },

    isMobile() {
        return window.innerWidth <= 768;
    },

    handleNavClick(pageName) {
        if (this.isMobile()) {
            this.switchMobilePage(pageName);
        } else {
            this.scrollToSection(pageName);
        }
    },

    switchMobilePage(pageName) {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        const navItem = document.querySelector(`.nav-item[data-page="${pageName}"]`);
        if (navItem) navItem.classList.add('active');

        document.querySelectorAll('.mobile-page').forEach(p => p.classList.remove('active'));
        const pageEl = document.getElementById(`page-${pageName}`);
        if (pageEl) pageEl.classList.add('active');

        if (pageName === 'trend') {
            this.loadHistory();
            setTimeout(() => this.renderChart(), 100);
        }
        
        window.scrollTo(0, 0);
    },

    scrollToSection(sectionName) {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        const navItem = document.querySelector(`.nav-item[data-page="${sectionName}"]`);
        if (navItem) navItem.classList.add('active');

        const sectionEl = document.getElementById(`page-${sectionName}`);
        if (sectionEl) {
            sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        if (sectionName === 'trend') {
            this.loadHistory();
            setTimeout(() => this.renderChart(), 100);
        }
    },

    async openSettings() {
        const { data: { session } } = await this.getDb().auth.getSession();
        if (session) {
            const user = session.user;
            document.getElementById('settings-email').textContent = user.email || '-';
            document.getElementById('settings-uid').textContent = user.id || '-';
            
            if (user.created_at) {
                const created = new Date(user.created_at);
                document.getElementById('settings-created').textContent = created.toLocaleString('zh-CN');
            }
            
            if (user.last_sign_in_at) {
                const lastLogin = new Date(user.last_sign_in_at);
                document.getElementById('settings-last-login').textContent = lastLogin.toLocaleString('zh-CN');
            }
            
            document.getElementById('settings-device-status').textContent = this.state.online ? '在线' : '离线';
        }
        
        try {
            const { count, error } = await this.getDb()
                .from('sensor_data')
                .select('*', { count: 'exact', head: true });
            if (!error && count !== null) {
                document.getElementById('settings-data-count').textContent = count + ' 条';
            }
        } catch (e) {
            console.log('获取数据计数失败');
        }
        
        document.getElementById('settings-modal').classList.add('active');
    },

    closeSettings() {
        document.getElementById('settings-modal').classList.remove('active');
    },

    async changePassword() {
        const email = document.getElementById('settings-email').textContent;
        if (!email) return;
        
        try {
            const { error } = await this.getDb().auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/login.html'
            });
            
            if (error) {
                this.showToast('发送失败: ' + error.message, 'error');
            } else {
                this.showToast('密码重置邮件已发送，请查收邮箱', 'success');
                this.closeSettings();
            }
        } catch (e) {
            this.showToast('发送失败', 'error');
        }
    },

    applySensorData(data, fromRealtime) {
        console.log('[DEBUG] applySensorData() 收到原始数据:', JSON.stringify(data), 'fromRealtime:', !!fromRealtime);

        if (data.Temp !== undefined || data.temp !== undefined)
            this.state.temp = data.Temp ?? data.temp ?? 0;
        if (data.Humi !== undefined || data.humidity !== undefined)
            this.state.humidity = data.Humi ?? data.humidity ?? 0;
        if (data.Light !== undefined || data.light !== undefined)
            this.state.light = data.Light ?? data.light ?? 0;
        if (data.CO2 !== undefined || data.co2 !== undefined)
            this.state.co2 = data.CO2 ?? data.co2 ?? 0;

        if (fromRealtime) {
            if (data.FAN !== undefined && !this.isControlLocked('FAN'))
                this.state.fan = data.FAN ?? data.fan ?? false;
            if (data.JSQ !== undefined && !this.isControlLocked('JSQ'))
                this.state.jsq = data.JSQ ?? data.jsq ?? false;
            if (data.LED !== undefined && !this.isControlLocked('LED'))
                this.state.led = data.LED ?? data.led ?? false;
            if (data.BEEP !== undefined && !this.isControlLocked('BEEP'))
                this.state.beep = data.BEEP ?? data.beep ?? false;

            var modeVal = data.APP_Mode ?? data.app_mode;
            if (modeVal !== undefined && !this.isControlLocked('APP_Mode')) {
                if (modeVal === true) modeVal = 1;
                else if (modeVal === false) modeVal = 0;
                else modeVal = parseInt(modeVal) || 1;
                this.state.app_mode = modeVal;
            }

            if (data.Temp_F !== undefined && !this.isControlLocked('Temp_F'))
                this.state.temp_f = data.Temp_F ?? data.temp_f ?? this.state.temp_f;
            if (data.Humi_F !== undefined && !this.isControlLocked('Humi_F'))
                this.state.humi_f = data.Humi_F ?? data.humi_f ?? this.state.humi_f;
            if (data.Light_F !== undefined && !this.isControlLocked('Light_F'))
                this.state.light_f = data.Light_F ?? data.light_f ?? this.state.light_f;
            if (data.CO2_F !== undefined && !this.isControlLocked('CO2_F'))
                this.state.co2_f = data.CO2_F ?? data.co2_f ?? this.state.co2_f;

            console.log('[DEBUG] applySensorData() Realtime更新, 被锁定的属性已跳过, 当前锁:', JSON.stringify(this._controlLock));
        } else {
            this.state.fan = data.FAN ?? data.fan ?? false;
            this.state.jsq = data.JSQ ?? data.jsq ?? false;
            this.state.led = data.LED ?? data.led ?? false;
            this.state.beep = data.BEEP ?? data.beep ?? false;
            var modeVal2 = data.APP_Mode ?? data.app_mode ?? 1;
            if (modeVal2 === true) modeVal2 = 1;
            else if (modeVal2 === false) modeVal2 = 0;
            else modeVal2 = parseInt(modeVal2) || 1;
            this.state.app_mode = modeVal2;
            this.state.temp_f = data.Temp_F ?? data.temp_f ?? this.state.temp_f;
            this.state.humi_f = data.Humi_F ?? data.humi_f ?? this.state.humi_f;
            this.state.light_f = data.Light_F ?? data.light_f ?? this.state.light_f;
            this.state.co2_f = data.CO2_F ?? data.co2_f ?? this.state.co2_f;
        }

        console.log('[DEBUG] applySensorData() 解析后state:', {
            temp: this.state.temp, humidity: this.state.humidity,
            light: this.state.light, co2: this.state.co2,
            fan: this.state.fan, jsq: this.state.jsq,
            led: this.state.led, beep: this.state.beep,
            app_mode: this.state.app_mode,
            temp_f: this.state.temp_f, humi_f: this.state.humi_f,
            light_f: this.state.light_f, co2_f: this.state.co2_f
        });
    },

    async loadLatestData() {
        console.log('[DEBUG] loadLatestData() 开始加载最新数据...');
        try {
            const { data, error } = await this.getDb()
                .from('sensor_data')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (error) {
                console.error('[DEBUG] loadLatestData() 查询出错:', error);
                throw error;
            }

            if (data) {
                console.log('[DEBUG] loadLatestData() 查询到数据:', JSON.stringify(data));
                this.applySensorData(data, false);
                this.updateAllSensors();
                this.updateDeviceControls();
                this.updateThresholdInputs();
                this.updateOnlineStatus(true);
            } else {
                console.warn('[DEBUG] loadLatestData() 没有查到数据');
            }
        } catch (err) {
            console.error('[DEBUG] loadLatestData() 失败:', err);
            this.showToast('加载数据失败，请检查 Supabase 配置', 'error');
        }
    },

    subscribeRealtime() {
        console.log('[DEBUG] subscribeRealtime() 开始订阅 Realtime...');
        this.getDb()
            .channel('sensor-data-changes')
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'sensor_data' },
                (payload) => {
                    console.log('[DEBUG] ★ Realtime 收到新数据 INSERT:', JSON.stringify(payload.new));
                    this.applySensorData(payload.new, true);
                    this.updateAllSensors();
                    this.updateDeviceControls();
                    this.updateOnlineStatus(true);
                    this.loadHistory();
                }
            )
            .subscribe((status) => {
                console.log('[DEBUG] Realtime 订阅状态变化:', status);
                if (status === 'SUBSCRIBED') {
                    console.log('[DEBUG] ✅ Realtime 订阅成功!');
                } else if (status === 'CHANNEL_ERROR') {
                    console.error('[DEBUG] ❌ Realtime 订阅出错!');
                } else if (status === 'TIMED_OUT') {
                    console.error('[DEBUG] ❌ Realtime 订阅超时!');
                }
            });
    },

    _controlTimer: null,
    _pendingControl: {},

    sendControl(attrs) {
        console.log('[DEBUG] sendControl() 收到控制请求:', JSON.stringify(attrs));
        if (this._controlTimer) clearTimeout(this._controlTimer);
        this._pendingControl = { ...this._pendingControl, ...attrs };
        console.log('[DEBUG] sendControl() 合并后的待发送payload:', JSON.stringify(this._pendingControl));
        this._controlTimer = setTimeout(async () => {
            const payload = this._pendingControl;
            this._pendingControl = {};
            console.log('[DEBUG] sendControl() 防抖结束, 最终发送payload:', JSON.stringify(payload));
            try {
                console.log('[DEBUG] sendControl() 调用 Edge Function control-device...');
                const { data, error } = await this.getDb().functions.invoke('control-device', {
                    body: payload
                });
                console.log('[DEBUG] sendControl() Edge Function 返回 data:', JSON.stringify(data));
                console.log('[DEBUG] sendControl() Edge Function 返回 error:', error);
                if (error) {
                    console.error('[DEBUG] ❌ 控制命令发送失败 (Edge Function error):', error);
                    this.showToast('控制命令发送失败', 'error');
                    return;
                }
                if (data && data.result === 1) {
                    console.log('[DEBUG] ✅ 控制命令发送成功! ThingsCloud返回 result=1, ts=', data.ts);
                    this.showToast('控制命令已发送', 'success');
                } else if (data && data.errcode === 403) {
                    console.warn('[DEBUG] ⚠️ 发送太频繁 (errcode=403):', data.message);
                    this.showToast('发送太频繁，请稍后再试', 'error');
                } else {
                    console.warn('[DEBUG] ⚠️ 控制命令返回异常:', JSON.stringify(data));
                    this.showToast('控制命令返回: ' + JSON.stringify(data), 'error');
                }
            } catch (err) {
                console.error('[DEBUG] ❌ sendControl() 异常:', err);
                this.showToast('控制命令发送失败', 'error');
            }
        }, 500);
    },

    async sendSingleControl(key, value) {
        console.log('[DEBUG] sendSingleControl() 发送单个控制属性:', key, '=', value);
        this.lockControl(key);

        var payload = {};
        payload[key] = value;

        try {
            console.log('[DEBUG] sendSingleControl() 调用 Edge Function, payload:', JSON.stringify(payload));
            const { data, error } = await this.getDb().functions.invoke('control-device', {
                body: payload
            });
            console.log('[DEBUG] sendSingleControl() 返回 data:', JSON.stringify(data));
            console.log('[DEBUG] sendSingleControl() 返回 error:', error);
            if (error) {
                console.error('[DEBUG] ❌ sendSingleControl 失败:', error);
                this.showToast('控制命令发送失败', 'error');
                return;
            }
            if (data && data.result === 1) {
                console.log('[DEBUG] ✅ sendSingleControl 成功! key=', key, ', value=', value);
                this.showToast('控制命令已发送', 'success');
            } else if (data && data.errcode === 403) {
                console.warn('[DEBUG] ⚠️ 发送太频繁:', data.message);
                this.showToast('发送太频繁，请稍后再试', 'error');
            } else {
                console.warn('[DEBUG] ⚠️ sendSingleControl 返回异常:', JSON.stringify(data));
                this.showToast('控制命令返回: ' + JSON.stringify(data), 'error');
            }
        } catch (err) {
            console.error('[DEBUG] ❌ sendSingleControl 异常:', err);
            this.showToast('控制命令发送失败', 'error');
        }
    },

    async saveThreshold() {
        this.lockControl('Temp_F');
        this.lockControl('Humi_F');
        this.lockControl('Light_F');
        this.lockControl('CO2_F');
        this.lockControl('APP_Mode');

        var thresholds = [
            { key: 'Temp_F', value: this.state.temp_f },
            { key: 'Humi_F', value: this.state.humi_f },
            { key: 'Light_F', value: this.state.light_f },
            { key: 'CO2_F', value: this.state.co2_f }
        ];

        console.log('[DEBUG] saveThreshold() 逐个发送阈值...');

        for (var i = 0; i < thresholds.length; i++) {
            var t = thresholds[i];
            var payload = {};
            payload[t.key] = t.value;
            console.log('[DEBUG] saveThreshold() 发送:', t.key, '=', t.value);
            try {
                const { data, error } = await this.getDb().functions.invoke('control-device', {
                    body: payload
                });
                console.log('[DEBUG] saveThreshold()', t.key, '返回:', JSON.stringify(data));
                if (error) {
                    console.error('[DEBUG] ❌ saveThreshold', t.key, '失败:', error);
                }
            } catch (err) {
                console.error('[DEBUG] ❌ saveThreshold', t.key, '异常:', err);
            }
            if (i < thresholds.length - 1) {
                await new Promise(r => setTimeout(r, 1200));
            }
        }
        this.showToast('阈值设置已发送', 'success');
    },

    async loadHistory(range = '1h') {
        console.log('[DEBUG] loadHistory() 加载历史数据, range=', range);
        try {
            const now = new Date();
            let since;
            switch (range) {
                case '6h': since = new Date(now - 6 * 3600000); break;
                case '24h': since = new Date(now - 24 * 3600000); break;
                default: since = new Date(now - 3600000); break;
            }

            const { data, error } = await this.getDb()
                .from('sensor_data')
                .select('created_at, Temp, Humi, CO2')
                .gte('created_at', since.toISOString())
                .order('created_at', { ascending: true });

            if (error) throw error;
            this.state.historyData = data || [];
            console.log('[DEBUG] loadHistory() 查到', this.state.historyData.length, '条历史数据');
            this.renderChart();
        } catch (err) {
            console.error('[DEBUG] loadHistory() 失败:', err);
        }
    },

    renderChart() {
        const canvas = document.getElementById('history-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;

        const data = this.state.historyData;
        if (data.length < 2) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '14px sans-serif';
            ctx.fillStyle = '#95a5a6';
            ctx.textAlign = 'center';
            ctx.fillText('暂无足够历史数据', canvas.width / 2, canvas.height / 2);
            return;
        }

        const w = canvas.width;
        const h = canvas.height;
        const padding = { top: 20, right: 20, bottom: 30, left: 40 };
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;

        ctx.clearRect(0, 0, w, h);

        const tempData = data.map(d => d.Temp ?? d.temp ?? 0);
        const humiData = data.map(d => d.Humi ?? d.humidity ?? 0);
        const maxVal = Math.max(...tempData, ...humiData, 50);

        ctx.strokeStyle = '#ecf0f1';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (chartH / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(w - padding.right, y);
            ctx.stroke();

            ctx.fillStyle = '#95a5a6';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(Math.round(maxVal - (maxVal / 4) * i), padding.left - 6, y + 4);
        }

        const drawLine = (arr, color) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            arr.forEach((val, i) => {
                const x = padding.left + (chartW / (arr.length - 1)) * i;
                const y = padding.top + chartH - (val / maxVal) * chartH;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        };

        drawLine(tempData, '#e74c3c');
        drawLine(humiData, '#3498db');

        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        const step = Math.max(1, Math.floor(data.length / 6));
        for (let i = 0; i < data.length; i += step) {
            const x = padding.left + (chartW / (data.length - 1)) * i;
            const t = new Date(data[i].created_at);
            ctx.fillStyle = '#95a5a6';
            ctx.fillText(`${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`, x, h - 8);
        }

        const legendY = padding.top;
        ctx.font = '11px sans-serif';
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(padding.left, legendY - 8, 12, 3);
        ctx.fillText('温度', padding.left + 18, legendY - 3);
        ctx.fillStyle = '#3498db';
        ctx.fillRect(padding.left + 55, legendY - 8, 12, 3);
        ctx.fillText('湿度', padding.left + 73, legendY - 3);
    },

    initQueryDefaults() {
        const now = new Date();
        const oneHourAgo = new Date(now - 3600000);
        document.getElementById('query-end').value = this.formatDatetimeLocal(now);
        document.getElementById('query-start').value = this.formatDatetimeLocal(oneHourAgo);
        this.queryResult = [];
    },

    formatDatetimeLocal(date) {
        const pad = n => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    },

    async queryHistory() {
        const startVal = document.getElementById('query-start').value;
        const endVal = document.getElementById('query-end').value;
        console.log('[DEBUG] queryHistory() 查询历史, start=', startVal, ', end=', endVal);

        if (!startVal || !endVal) {
            this.showToast('请选择开始和结束时间', 'error');
            return;
        }

        try {
            const { data, error } = await this.getDb()
                .from('sensor_data')
                .select('*')
                .gte('created_at', new Date(startVal).toISOString())
                .lte('created_at', new Date(endVal).toISOString())
                .order('created_at', { ascending: false })
                .limit(500);

            if (error) throw error;

            this.queryResult = data || [];
            console.log('[DEBUG] queryHistory() 查到', this.queryResult.length, '条记录');
            this.renderQueryTable();
        } catch (err) {
            console.error('[DEBUG] queryHistory() 失败:', err);
            this.showToast('查询失败', 'error');
        }
    },

    renderQueryTable() {
        const tbody = document.getElementById('query-tbody');
        const footer = document.getElementById('query-footer');
        const data = this.queryResult;

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="padding:30px;color:#95a5a6">暂无数据</td></tr>';
            footer.textContent = '';
            return;
        }

        tbody.innerHTML = data.map(row => {
            const t = new Date(row.created_at);
            const time = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')} ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}:${String(t.getSeconds()).padStart(2,'0')}`;
            const boolTag = v => v ? '<span class="status-on">ON</span>' : '<span class="status-off">OFF</span>';
            const modeTag = (row.APP_Mode ?? row.app_mode) === 1 ? '手动' : '自动';
            return `<tr>
                <td>${time}</td>
                <td>${row.Temp ?? row.temp ?? '-'}</td>
                <td>${row.Humi ?? row.humidity ?? '-'}</td>
                <td>${row.Light ?? row.light ?? '-'}</td>
                <td>${row.CO2 ?? row.co2 ?? '-'}</td>
                <td>${boolTag(row.FAN ?? row.fan)}</td>
                <td>${boolTag(row.JSQ ?? row.jsq)}</td>
                <td>${boolTag(row.LED ?? row.led)}</td>
                <td>${boolTag(row.BEEP ?? row.beep)}</td>
                <td>${modeTag}</td>
            </tr>`;
        }).join('');

        footer.textContent = `共 ${data.length} 条记录`;
    },

    exportCSV() {
        const data = this.queryResult;
        if (data.length === 0) {
            this.showToast('请先查询数据再导出', 'error');
            return;
        }

        const headers = ['时间','温度','湿度','光照','CO2','风扇','加湿器','灯光','蜂鸣器','模式'];
        const rows = data.map(row => {
            const t = new Date(row.created_at);
            const time = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')} ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}:${String(t.getSeconds()).padStart(2,'0')}`;
            return [time, row.Temp??row.temp, row.Humi??row.humidity, row.Light??row.light, row.CO2??row.co2, (row.FAN??row.fan)?1:0, (row.JSQ??row.jsq)?1:0, (row.LED??row.led)?1:0, (row.BEEP??row.beep)?1:0, (row.APP_Mode??row.app_mode)===1?'手动':'自动'];
        });

        const bom = '\uFEFF';
        const csv = bom + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sensor_data_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('CSV 导出成功', 'success');
    },

    showToast(msg, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = msg;
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    console.log('[DEBUG] DOMContentLoaded, 开始初始化 App');
    App.init();
});

window.addEventListener('resize', () => {
    App.renderChart();
});
