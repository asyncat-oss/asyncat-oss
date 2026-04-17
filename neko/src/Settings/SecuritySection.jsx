import React, { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';
import useAuth from '../hooks/useAuth';
import PasswordRequirements from '../auth/PasswordRequirements';
import FormInput from '../auth/FormInput';

const soraFontBase = "font-sora";

const SecuritySection = ({ session }) => {
  const { updatePassword } = useAuth();
  const [message, setMessage] = useState(null);

  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState({});
  const passwordRequirementChecks = [
    {
      message: 'Password must be at least 8 characters long',
      test: (pwd) => pwd.length >= 8,
    },
    {
      message: 'Password must contain at least one uppercase letter',
      test: (pwd) => /[A-Z]/.test(pwd),
    },
    {
      message: 'Password must contain at least one lowercase letter',
      test: (pwd) => /[a-z]/.test(pwd),
    },
    {
      message: 'Password must include at least one number and one special character',
      test: (pwd) =>
        /[0-9]/.test(pwd) &&
        /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd),
    },
  ];
  const confirmPasswordError =
    passwordErrors.confirmPassword ||
    (passwordForm.confirmPassword !== '' &&
     passwordForm.confirmPassword !== passwordForm.newPassword
      ? "Passwords don't match"
      : null);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordErrors({});

    const errors = {};

    if (!passwordForm.newPassword) {
      errors.newPassword = 'New password is required';
    } else {
      const failingRequirement = passwordRequirementChecks.find(
        (requirement) => !requirement.test(passwordForm.newPassword)
      );
      if (failingRequirement) {
        errors.newPassword = failingRequirement.message;
      }
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(errors).length > 0) {
      setPasswordErrors(errors);
      return;
    }

    setPasswordLoading(true);
    try {
      await updatePassword(passwordForm.newPassword);

      setMessage({
        type: 'success',
        text: 'Password updated successfully! Please sign in again with your new password.'
      });

      setPasswordForm({ newPassword: '', confirmPassword: '' });

      setTimeout(() => {
        window.location.href = '/auth';
      }, 2000);
    } catch (error) {
      console.error('Password update error:', error);

      let errorMessage = 'Failed to update password. Please try again.';
      if (error.message?.includes('weak_password')) {
        errorMessage = 'Password is too weak. Please choose a stronger password.';
      } else if (error.message?.includes('session_not_found')) {
        errorMessage = 'Your session has expired. Please sign in again.';
      }

      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handlePasswordInputChange = (field, value) => {
    setPasswordForm(prev => ({ ...prev, [field]: value }));
    if (passwordErrors[field]) {
      setPasswordErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <div className={`space-y-6 ${soraFontBase}`}>
      {message && (
        <div className={`p-4 rounded-lg text-sm ${
          message.type === 'success'
            ? 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-200 midnight:bg-green-900 midnight:text-green-300'
            : 'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-200 midnight:bg-red-900 midnight:text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* Change Password Section */}
      <div className="bg-transparent border-0 py-2">
        <div className="flex items-center gap-2 mb-4">
          <Lock size={18} className="text-gray-500 dark:text-gray-400" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white midnight:text-gray-100">Change Password</h3>
        </div>

        <form onSubmit={handlePasswordChange} className="space-y-4">
          <input
            type="text"
            autoComplete="username"
            value={session?.user?.email || ''}
            readOnly
            style={{ display: 'none' }}
            aria-hidden="true"
            tabIndex="-1"
          />

          <FormInput
            label="New Password"
            type="password"
            autoComplete="new-password"
            value={passwordForm.newPassword}
            onChange={(e) => handlePasswordInputChange('newPassword', e.target.value)}
            placeholder="Enter your new password (min. 8 characters)"
            disabled={passwordLoading}
            error={passwordErrors.newPassword}
          />

          <FormInput
            label="Confirm New Password"
            type="password"
            autoComplete="new-password"
            value={passwordForm.confirmPassword}
            onChange={(e) => handlePasswordInputChange('confirmPassword', e.target.value)}
            placeholder="Confirm your new password"
            disabled={passwordLoading}
            error={confirmPasswordError}
          />

          <PasswordRequirements
            password={passwordForm.newPassword}
            email={session?.user?.email || ''}
            fullName={
              session?.user?.user_metadata?.full_name ||
              session?.user?.user_metadata?.name ||
              ''
            }
          />

          <div className="pt-2">
            <button
              type="submit"
              disabled={passwordLoading || !passwordForm.newPassword || !passwordForm.confirmPassword}
              className="px-4 py-2 bg-gray-900 dark:bg-gray-100 midnight:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 midnight:hover:bg-gray-200 text-white dark:text-gray-900 midnight:text-gray-900 rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {passwordLoading ? 'Updating Password...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SecuritySection;
