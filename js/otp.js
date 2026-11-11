document.addEventListener("DOMContentLoaded", async () => {
    const inputs = document.querySelectorAll('.otp-input');

    inputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            const value = e.target.value;
            if (value && index < inputs.length - 1) {
                inputs[index + 1].focus();
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !input.value && index > 0) {
                inputs[index - 1].focus();
            }
        });
    });

    if (inputs.length > 0) inputs[0].focus();

    try {
        const session = await API.session();
        if (session.authenticated) {
            window.location.replace('index.html');
            return;
        }
        if (!session.pendingOtpEmail) {
            window.location.replace('index.html');
            return;
        }
        document.getElementById('displayEmail').textContent = session.pendingOtpEmail;
    } catch (error) {
        showOtpAlert(error.message, 'error');
        return;
    }

    // Start 60-second cooldown timer upon landing from registration.
    startResendCooldown(60);
});

let resendTimer = null;

function startResendCooldown(seconds) {
    const resendBtn = document.getElementById('resendBtn');
    if (!resendBtn) return;

    if (resendTimer) clearInterval(resendTimer);

    let remaining = Math.max(1, parseInt(seconds, 10));
    resendBtn.disabled = true;
    resendBtn.textContent = `Resend in ${remaining}s`;

    resendTimer = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(resendTimer);
            resendTimer = null;
            resendBtn.disabled = false;
            resendBtn.textContent = 'Resend OTP';
        } else {
            resendBtn.textContent = `Resend in ${remaining}s`;
        }
    }, 1000);
}

// submit otp code to backend
async function handleOtpVerification(e) {
    e.preventDefault();
    const inputs = document.querySelectorAll('.otp-input');
    let otpCode = '';
    inputs.forEach(input => otpCode += input.value.trim());

    if (otpCode.length !== 6) {
        showOtpAlert('Please enter all 6 digits of the verification code.', 'error');
        return;
    }

    try {
        const data = await API.post('/auth/verify-otp', { otp: otpCode });
        showOtpAlert('Account verified successfully! Redirecting to login...', 'success');
        setTimeout(() => {
            window.location.href = data.redirect || 'index.html?registered=success';
        }, 1200);
    } catch (error) {
        showOtpAlert(error.message || 'Invalid verification code.', 'error');
        if (error.data && error.data.locked) {
            inputs.forEach(input => {
                input.value = '';
                input.disabled = true;
            });
            setTimeout(() => {
                window.location.href = 'index.html?error=' + encodeURIComponent(error.message);
            }, 3500);
        }
    }
}

// request new otp via resend
async function resendOtpCode() {
    try {
        const data = await API.post('/auth/resend-otp', {});
        showOtpAlert(data.message || 'A new verification code has been sent to your email.', 'success');
        startResendCooldown(data.cooldown || 60);
    } catch (error) {
        showOtpAlert(error.message || 'Failed to resend code.', 'error');
        if (error.data && error.data.retry_after) {
            startResendCooldown(error.data.retry_after);
        }
    }
}

function showOtpAlert(msg, type = 'error') {
    const alertBox = document.getElementById('otpAlert');
    const alertIcon = document.getElementById('otpAlertIcon');
    const alertMessage = document.getElementById('otpAlertMessage');

    if (!alertBox) return;

    alertMessage.textContent = msg;
    alertBox.classList.remove('hidden', 'bg-rose-50', 'text-rose-800', 'bg-emerald-50', 'text-emerald-800', 'border-rose-200', 'border-emerald-200');

    if (type === 'error') {
        alertBox.classList.add('bg-rose-50', 'text-rose-800', 'border', 'border-rose-200');
        alertIcon.className = 'fa-solid fa-circle-exclamation mt-0.5 text-sm text-rose-600';
    } else {
        alertBox.classList.add('bg-emerald-50', 'text-emerald-800', 'border', 'border-emerald-200');
        alertIcon.className = 'fa-solid fa-circle-check mt-0.5 text-sm text-emerald-600';
    }
}
