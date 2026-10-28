export const PASSWORD_MIN_LENGTH = 8;

export type PasswordRequirement = {
  key: 'length' | 'lowercase' | 'uppercase' | 'number' | 'special';
  met: boolean;
  label: string;
};

export const getPasswordRequirements = (password: string): PasswordRequirement[] => {
  const missingCharacters = Math.max(0, PASSWORD_MIN_LENGTH - password.length);
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  return [
    {
      key: 'length',
      met: missingCharacters === 0,
      label:
        missingCharacters === 0
          ? `Almeno ${PASSWORD_MIN_LENGTH} caratteri`
          : `Mancano ${missingCharacters} caratteri (minimo ${PASSWORD_MIN_LENGTH})`,
    },
    {
      key: 'uppercase',
      met: hasUppercase,
      label: hasUppercase ? 'Lettera maiuscola presente' : 'Manca una lettera maiuscola',
    },
    {
      key: 'lowercase',
      met: hasLowercase,
      label: hasLowercase ? 'Lettera minuscola presente' : 'Manca una lettera minuscola',
    },
    {
      key: 'number',
      met: hasNumber,
      label: hasNumber ? 'Numero presente' : 'Manca un numero',
    },
    {
      key: 'special',
      met: hasSpecial,
      label: hasSpecial ? 'Carattere speciale presente' : 'Manca un carattere speciale',
    },
  ];
};

export type PasswordPolicyResult = {
  valid: boolean;
  errors: string[];
  message: string;
};

export const validateStrongPassword = (password: string): PasswordPolicyResult => {
  const errors: string[] = [];

  getPasswordRequirements(password).forEach((requirement) => {
    if (!requirement.met) {
      const labels: Record<PasswordRequirement['key'], string> = {
        length: `almeno ${PASSWORD_MIN_LENGTH} caratteri`,
        lowercase: 'una lettera minuscola',
        uppercase: 'una lettera maiuscola',
        number: 'un numero',
        special: 'un carattere speciale',
      };
      errors.push(labels[requirement.key]);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    message: errors.length === 0 ? '' : `La password deve contenere ${errors.join(', ')}.`,
  };
};
