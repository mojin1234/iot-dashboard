const Auth = {
    getDb() {
        return supabaseClient;
    },

    async init() {
        this.bindEvents();
        await this.checkSession();
    },

    async checkSession() {
        const { data: { session } } = await this.getDb().auth.getSession();
        if (session) {
            window.location.href = 'index.html';
        }
    },

    bindEvents() {
        document.querySelectorAll('.login-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                const tabName = tab.dataset.tab;
                document.querySelectorAll('.login-form').forEach(f => f.classList.remove('active'));
                document.getElementById(`${tabName}-form`).classList.add('active');
                
                this.clearErrors();
            });
        });

        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.login();
        });

        document.getElementById('register-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.register();
        });

        document.getElementById('forgot-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.resetPassword();
        });

        document.getElementById('link-forgot').addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.login-form').forEach(f => f.classList.remove('active'));
            document.getElementById('forgot-form').classList.add('active');
            this.clearErrors();
        });

        document.getElementById('link-back-login').addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
            document.querySelector('.login-tab[data-tab="login"]').classList.add('active');
            document.querySelectorAll('.login-form').forEach(f => f.classList.remove('active'));
            document.getElementById('login-form').classList.add('active');
            this.clearErrors();
        });
    },

    clearErrors() {
        document.querySelectorAll('.form-error').forEach(el => el.textContent = '');
    },

    showError(formId, message) {
        document.getElementById(`${formId}-error`).textContent = message;
    },

    async login() {
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        if (!email || !password) {
            this.showError('login', '请填写邮箱和密码');
            return;
        }

        const btn = document.getElementById('btn-login');
        btn.disabled = true;
        btn.textContent = '登录中...';

        try {
            const { data, error } = await this.getDb().auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) {
                this.showError('login', this.getErrorMessage(error.message));
                btn.disabled = false;
                btn.textContent = '登录';
                return;
            }

            window.location.href = 'index.html';
        } catch (err) {
            this.showError('login', '登录失败，请稍后重试');
            btn.disabled = false;
            btn.textContent = '登录';
        }
    },

    async register() {
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        const confirm = document.getElementById('register-confirm').value;

        if (!email || !password || !confirm) {
            this.showError('register', '请填写所有字段');
            return;
        }

        if (password.length < 6) {
            this.showError('register', '密码至少需要6位');
            return;
        }

        if (password !== confirm) {
            this.showError('register', '两次输入的密码不一致');
            return;
        }

        const btn = document.getElementById('btn-register');
        btn.disabled = true;
        btn.textContent = '注册中...';

        try {
            const { data, error } = await this.getDb().auth.signUp({
                email: email,
                password: password
            });

            if (error) {
                this.showError('register', this.getErrorMessage(error.message));
                btn.disabled = false;
                btn.textContent = '注册';
                return;
            }

            if (data.user && !data.session) {
                this.showError('register', '');
                alert('注册成功！请查收邮箱验证邮件，验证后即可登录。');
                document.querySelector('.login-tab[data-tab="login"]').click();
            } else {
                window.location.href = 'index.html';
            }
        } catch (err) {
            this.showError('register', '注册失败，请稍后重试');
        } finally {
            btn.disabled = false;
            btn.textContent = '注册';
        }
    },

    async resetPassword() {
        const email = document.getElementById('forgot-email').value.trim();

        if (!email) {
            this.showError('forgot', '请输入邮箱');
            return;
        }

        const btn = document.getElementById('btn-reset');
        btn.disabled = true;
        btn.textContent = '发送中...';

        try {
            const { error } = await this.getDb().auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/login.html'
            });

            if (error) {
                this.showError('forgot', this.getErrorMessage(error.message));
                btn.disabled = false;
                btn.textContent = '发送重置邮件';
                return;
            }

            alert('密码重置邮件已发送，请查收邮箱。');
            document.getElementById('link-back-login').click();
        } catch (err) {
            this.showError('forgot', '发送失败，请稍后重试');
        } finally {
            btn.disabled = false;
            btn.textContent = '发送重置邮件';
        }
    },

    getErrorMessage(message) {
        const errorMap = {
            'Invalid login credentials': '邮箱或密码错误',
            'Email not confirmed': '邮箱未验证，请查收验证邮件',
            'User already registered': '该邮箱已注册',
            'Password should be at least 6 characters': '密码至少需要6位',
            'Invalid email': '邮箱格式不正确',
            'Unable to validate email address: invalid format': '邮箱格式不正确',
            'Signups not allowed': '暂不允许注册'
        };
        return errorMap[message] || message;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Auth.init();
});
