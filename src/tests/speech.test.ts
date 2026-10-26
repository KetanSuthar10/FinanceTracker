import { describe, expect, it } from 'vitest';
import { joinSegments, networkErrorText } from '../hooks/useSpeechRecognition';

describe('joining what was heard', () => {
  it('joins pieces of a long sentence', () => {
    expect(joinSegments(['paid 450 for groceries', ' at DMart yesterday', 'from HDFC card'])).toBe(
      'paid 450 for groceries at DMart yesterday from HDFC card',
    );
  });
  it('drops the repeats some Android phones send', () => {
    expect(joinSegments(['paid 450', 'paid 450 for groceries', 'paid 450 for groceries at DMart yesterday'])).toBe(
      'paid 450 for groceries at DMart yesterday',
    );
    expect(joinSegments(['got salary', 'got salary', '50000 today'])).toBe('got salary 50000 today');
  });
  it('ignores empty pieces and extra spaces', () => {
    expect(joinSegments(['', '  120   cafe ', ''])).toBe('120 cafe');
  });
});

describe('network error message', () => {
  it('says offline when offline, otherwise explains the browser service', () => {
    expect(networkErrorText(false)).toMatch(/offline/);
    expect(networkErrorText(true)).toMatch(/Chrome, Edge or Safari/);
  });
});
