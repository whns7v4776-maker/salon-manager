import { Platform, type ViewStyle } from 'react-native';

type WebClickEvent = {
  currentTarget?: EventTarget | null;
  target?: EventTarget | null;
};

type WebExpandableCardOptions = {
  expanded: boolean;
  disabled?: boolean;
};

type WebExpandableCardProps = {
  onClick?: (event: unknown) => void;
};

const INTERACTIVE_DESCENDANT_SELECTOR = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  '[role="button"]',
  '[role="link"]',
  '[contenteditable="true"]',
].join(',');

/**
 * Makes the whole collapsed card an expansion target on web while preserving
 * every nested control. Native receives no handler and no visual change.
 */
export function getWebExpandableCardProps(
  onExpand: () => void,
  { expanded, disabled = false }: WebExpandableCardOptions,
): WebExpandableCardProps {
  if (Platform.OS !== 'web' || expanded || disabled) return {};

  return {
    onClick: (event: unknown) => {
      const webEvent = event as WebClickEvent;
      const target = webEvent.target;
      const currentTarget = webEvent.currentTarget;

      if (
        typeof Element !== 'undefined' &&
        target instanceof Element &&
        currentTarget instanceof Element &&
        target !== currentTarget &&
        target.closest(INTERACTIVE_DESCENDANT_SELECTOR)
      ) {
        return;
      }

      onExpand();
    },
  };
}

export function getWebExpandableCardStyle(
  expanded: boolean,
  disabled = false,
): ViewStyle | undefined {
  if (Platform.OS !== 'web' || expanded || disabled) return undefined;
  return { cursor: 'pointer' };
}
