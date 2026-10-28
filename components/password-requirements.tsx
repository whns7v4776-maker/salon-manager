import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { PASSWORD_MIN_LENGTH } from '../src/lib/password-policy';
import { StyleSheet, Text, View } from 'react-native';
import { getPasswordRequirements } from '../src/lib/password-policy';

export function PasswordRequirements({
  password,
  compact = false,
  alignLeft = false,
}: {
  password: string;
  compact?: boolean;
  alignLeft?: boolean;
}) {
  const requirements = getPasswordRequirements(password);

  return (
    <View style={[styles.container, alignLeft && styles.containerLeft]}>
      <Text
        maxFontSizeMultiplier={compact ? 1 : undefined}
        style={[
          styles.title,
          compact && styles.titleCompact,
          alignLeft && styles.textLeft,
        ]}
      >
        Requisiti della password
      </Text>
      {requirements.map((requirement) => (
        <View key={requirement.key} style={styles.row} accessible accessibilityLabel={`${requirement.met ? 'Soddisfatto' : 'Da completare'}: ${requirement.label}`}>
          <Ionicons name={requirement.met ? 'checkmark-circle' : 'ellipse-outline'} size={compact ? 14 : 16} color={requirement.met ? '#047857' : '#94A3B8'} />
          <Text maxFontSizeMultiplier={compact ? 1 : undefined} style={[styles.requirement, compact && styles.requirementCompact, requirement.met && styles.requirementMet]}>
            {{ length: `Almeno ${PASSWORD_MIN_LENGTH} caratteri`, uppercase: 'Una lettera maiuscola', lowercase: 'Una lettera minuscola', number: 'Un numero', special: 'Un carattere speciale' }[requirement.key]}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function PasswordMatchRequirement({
  password,
  confirmPassword,
  compact = false,
  alignLeft = false,
}: {
  password: string;
  confirmPassword: string;
  compact?: boolean;
  alignLeft?: boolean;
}) {
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const matches =
    password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;

  return (
    <View style={[styles.matchContainer, alignLeft && styles.containerLeft]}>
      <View style={styles.row}>
      <Ionicons name={matches ? 'checkmark-circle' : mismatch ? 'alert-circle' : 'ellipse-outline'} size={compact ? 14 : 16} color={matches ? '#047857' : mismatch ? '#B91C1C' : '#94A3B8'} />
      <Text
        accessibilityLiveRegion="polite"
        maxFontSizeMultiplier={compact ? 1 : undefined}
        style={[
          styles.requirement,
          compact && styles.requirementCompact,
          matches && styles.requirementMet,
          mismatch && styles.requirementError,
          alignLeft && styles.textLeft,
        ]}
      >
        {matches ? 'Le password coincidono' : mismatch ? 'Le password non corrispondono' : 'Le password devono coincidere'}
      </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginTop: -2,
    marginBottom: 10,
    paddingHorizontal: 8,
    alignItems: 'stretch',
  },
  title: {
    color: '#334155',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    marginBottom: 7,
    textAlign: 'left',
  },
  titleCompact: {
    fontSize: 11,
    lineHeight: 15,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  requirement: {
    flexShrink: 1,
    color: '#64748B',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    textAlign: 'left',
  },
  requirementCompact: {
    fontSize: 10.5,
    lineHeight: 14,
  },
  requirementError: { color: '#B91C1C', fontWeight: '700' },
  requirementMet: {
    color: '#047857',
    fontWeight: '600',
  },
  matchContainer: {
    width: '100%',
    marginTop: -2,
    marginBottom: 10,
    paddingHorizontal: 8,
    alignItems: 'stretch',
  },
  containerLeft: {
    alignItems: 'stretch',
  },
  textLeft: {
    width: '100%',
    textAlign: 'left',
  },
});
