import type { RefObject } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import {
    Dimensions,
    findNodeHandle,
    InteractionManager,
    Keyboard,
    type KeyboardEvent,
    Platform,
    TextInput,
    UIManager,
    type FlatList,
    type ScrollView,
    type SectionList,
} from 'react-native';

type Scrollable = ScrollView | FlatList<any> | SectionList<any>;
type ScrollableRef = RefObject<Scrollable | null>;
type InputRef = RefObject<TextInput | null>;
type NodeRef<T = any> = RefObject<T | null>;

type KeyboardAwareScrollOptions = {
  topOffset?: number;
  scrollDelay?: number;
  focusScrollDelay?: number;
  animated?: boolean;
  keyboardHeight?: number;
  allowWebScroll?: boolean;
  autoScrollOnKeyboardShow?: boolean;
  shouldScrollNode?: (node: unknown) => boolean;
};

type KeyboardAwareScrollOverride = {
  topOffset?: number;
  scrollDelay?: number;
  animated?: boolean;
};

const DEFAULT_TOP_OFFSET = Platform.OS === 'ios' ? 156 : 124;

const resolveScrollableNode = (scrollable: Scrollable | null) => {
  if (!scrollable) return null;

  return (
    (scrollable as Scrollable & { getNativeScrollRef?: () => unknown }).getNativeScrollRef?.() ??
    (scrollable as Scrollable & { getScrollResponder?: () => unknown }).getScrollResponder?.() ??
    scrollable
  );
};

const scrollContainerTo = (scrollable: Scrollable | null, offset: number, animated: boolean) => {
  if (!scrollable) return;

  const safeOffset = Math.max(0, offset);

  if (
    typeof (scrollable as FlatList<any> & { scrollToOffset?: (params: { offset: number; animated?: boolean }) => void }).scrollToOffset ===
    'function'
  ) {
    (
      scrollable as FlatList<any> & {
        scrollToOffset: (params: { offset: number; animated?: boolean }) => void;
      }
    ).scrollToOffset({ offset: safeOffset, animated });
    return;
  }

  if (
    typeof (scrollable as ScrollView & { scrollTo?: (params: { y: number; animated?: boolean }) => void }).scrollTo ===
    'function'
  ) {
    (
      scrollable as ScrollView & {
        scrollTo: (params: { y: number; animated?: boolean }) => void;
      }
    ).scrollTo({ y: safeOffset, animated });
  }
};

const runAfterLayout = (work: () => void, delay = 0) => {
  const run = () => {
    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(work);
    });
  };

  if (delay > 0) {
    setTimeout(run, delay);
    return;
  }

  run();
};

const resolveKeyboardHeight = (event?: KeyboardEvent | null) => {
  const eventHeight = event?.endCoordinates?.height ?? 0;
  if (eventHeight > 0) {
    return eventHeight;
  }

  const keyboardWithMetrics = Keyboard as typeof Keyboard & {
    metrics?: () => { height?: number } | undefined;
  };

  const metricsHeight = keyboardWithMetrics.metrics?.()?.height ?? 0;
  return metricsHeight > 0 ? metricsHeight : 0;
};

const scrollNodeIntoView = (
  node: unknown,
  scrollRef: ScrollableRef,
  options?: KeyboardAwareScrollOptions
) => {
  const scrollable = scrollRef.current;
  if (!node || !scrollable) return;

  if (Platform.OS === 'web' && !options?.allowWebScroll) {
    // Web must not be auto-scrolled by JS while typing.
    // Keep scrolling manual to avoid viewport jumps/keyboard collapse.
    return;
  }

  const scrollNode = resolveScrollableNode(scrollable);
  const inputHandle = findNodeHandle(node as any);
  const scrollHandle = findNodeHandle(scrollNode as any);
  if (!scrollHandle || !inputHandle) {
    return;
  }

  const delay = Math.max(0, options?.scrollDelay ?? 48);
  const animated = options?.animated ?? true;
  const keyboardGap = Platform.OS === 'ios' ? 14 : 10;
  const topOffset = options?.topOffset ?? DEFAULT_TOP_OFFSET;
  const additionalKeyboardOffset = Math.max(keyboardGap, topOffset);
  const responderScrollToKeyboard = (
    (
      scrollable as Scrollable & {
        getScrollResponder?: () => unknown;
      }
    ).getScrollResponder?.() as
      | {
          scrollResponderScrollNativeHandleToKeyboard?: (
            nodeHandle: number,
            additionalOffset?: number,
            preventNegativeScrollOffset?: boolean
          ) => void;
        }
      | undefined
  )?.scrollResponderScrollNativeHandleToKeyboard;

  if (typeof responderScrollToKeyboard === 'function') {
    runAfterLayout(() => {
      responderScrollToKeyboard(inputHandle, additionalKeyboardOffset, true);
    }, delay);
    return;
  }

  const measureAndScroll = () => {
    try {
      const windowHeight = Dimensions.get('window').height;
      const screenHeight = Dimensions.get('screen').height;
      const keyboardHeight = Math.max(0, options?.keyboardHeight ?? 0);
      const resizedByKeyboard = Math.max(0, screenHeight - windowHeight);
      const overlayKeyboardHeight = Math.max(0, keyboardHeight - resizedByKeyboard);
      const visibleBottom = windowHeight - overlayKeyboardHeight - keyboardGap;

      UIManager.measureInWindow(inputHandle, (_x, y, _w, measuredHeight) => {
        const nodeBottom = y + measuredHeight;
        const overlap = nodeBottom - visibleBottom;

        if (overlap <= 0) {
          return;
        }

        UIManager.measureLayout(
          inputHandle,
          scrollHandle,
          () => null,
          (_left, top) => {
            const targetOffset = Math.max(0, top - topOffset + overlap + keyboardGap);
            scrollContainerTo(scrollable, targetOffset, animated);
          }
        );
      });
    } catch {
      return;
    }
  };

  runAfterLayout(measureAndScroll, delay);
};

export const useKeyboardAwareScroll = (
  scrollRef: ScrollableRef,
  options?: KeyboardAwareScrollOptions
) => {
  const topOffset = options?.topOffset ?? DEFAULT_TOP_OFFSET;
  const scrollDelay = Math.max(0, options?.scrollDelay ?? 48);
  const focusScrollDelay = Math.max(scrollDelay, options?.focusScrollDelay ?? 96);
  const animated = options?.animated ?? true;
  const keyboardHeightRef = useRef(resolveKeyboardHeight());

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    if (options?.autoScrollOnKeyboardShow !== true) {
      return;
    }

    const eventNames = Platform.OS === 'ios'
      ? ['keyboardWillShow', 'keyboardWillChangeFrame']
      : ['keyboardDidShow'];

    const subscriptions = eventNames.map((eventName) =>
      Keyboard.addListener(eventName as 'keyboardWillShow', (event) => {
        keyboardHeightRef.current = resolveKeyboardHeight(event);
        const focusedInput = (
          TextInput.State as unknown as {
            currentlyFocusedInput?: () => TextInput | null;
          }
        ).currentlyFocusedInput?.();

        if (options?.shouldScrollNode && !options.shouldScrollNode(focusedInput ?? null)) {
          return;
        }

        scrollNodeIntoView(focusedInput ?? null, scrollRef, {
          topOffset,
          scrollDelay,
          animated,
          keyboardHeight: keyboardHeightRef.current,
        });
      })
    );

    subscriptions.push(
      Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
        () => {
          keyboardHeightRef.current = 0;
        }
      )
    );

    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [animated, options, scrollDelay, scrollRef, topOffset]);

  const scrollToField = useCallback(
    (inputRef: InputRef, override?: KeyboardAwareScrollOverride) => {
      if (options?.shouldScrollNode && !options.shouldScrollNode(inputRef.current)) {
        return;
      }

      scrollNodeIntoView(inputRef.current, scrollRef, {
        topOffset: override?.topOffset ?? topOffset,
        scrollDelay: override?.scrollDelay ?? scrollDelay,
        animated: override?.animated ?? animated,
        keyboardHeight: keyboardHeightRef.current || resolveKeyboardHeight(),
      });
    },
    [animated, options, scrollDelay, scrollRef, topOffset]
  );

  const scrollToNode = useCallback(
    (nodeRef: NodeRef, override?: KeyboardAwareScrollOverride) => {
      if (options?.shouldScrollNode && !options.shouldScrollNode(nodeRef.current)) {
        return;
      }

      scrollNodeIntoView(nodeRef.current, scrollRef, {
        topOffset: override?.topOffset ?? topOffset,
        scrollDelay: override?.scrollDelay ?? scrollDelay,
        animated: override?.animated ?? animated,
        keyboardHeight: keyboardHeightRef.current || resolveKeyboardHeight(),
      });
    },
    [animated, options, scrollDelay, scrollRef, topOffset]
  );

  const focusField = useCallback(
    (inputRef: InputRef) => {
      inputRef.current?.focus();
      if (Platform.OS === 'web') {
        return;
      }
      if (options?.shouldScrollNode && !options.shouldScrollNode(inputRef.current)) {
        return;
      }
      scrollNodeIntoView(inputRef.current, scrollRef, {
        topOffset,
        scrollDelay: focusScrollDelay,
        animated,
        keyboardHeight: keyboardHeightRef.current || resolveKeyboardHeight(),
      });
    },
    [animated, focusScrollDelay, options, scrollRef, topOffset]
  );

  return { focusField, scrollToField, scrollToNode };
};

export const focusNextInput = (
  refs: InputRef[],
  focusField: (inputRef: InputRef) => void
) => {
  const focusedInput = (
    TextInput.State as unknown as {
      currentlyFocusedInput?: () => TextInput | null;
    }
  ).currentlyFocusedInput?.();

  if (!focusedInput) {
    const firstRef = refs.find((item) => !!item.current);
    if (!firstRef) {
      Keyboard.dismiss();
      return false;
    }
    focusField(firstRef);
    return true;
  }

  const currentIndex = refs.findIndex((item) => item.current === focusedInput);
  if (currentIndex < 0) {
    const firstRef = refs.find((item) => !!item.current);
    if (!firstRef) {
      Keyboard.dismiss();
      return false;
    }
    focusField(firstRef);
    return true;
  }

  const nextRef = refs.slice(currentIndex + 1).find((item) => !!item.current) ?? null;
  if (!nextRef) {
    Keyboard.dismiss();
    return false;
  }

  focusField(nextRef);
  return true;
};
