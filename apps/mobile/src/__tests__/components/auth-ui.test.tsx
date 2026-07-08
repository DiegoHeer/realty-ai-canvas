import { initI18n } from '@realty/i18n';
import { fireEvent, render } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';

import { isValidEmail, OAuthButton } from '@/components/auth-ui';

async function renderButton(onPress: () => void) {
  const i18n = initI18n('en');
  return render(
    <I18nextProvider i18n={i18n}>
      <OAuthButton onPress={onPress} />
    </I18nextProvider>,
  );
}

describe('OAuthButton', () => {
  it('renders the Google button and fires onPress', async () => {
    const onPress = jest.fn();
    const { getByText, getByTestId } = await renderButton(onPress);

    expect(getByText('Continue with Google')).toBeTruthy();
    fireEvent.press(getByTestId('oauth-button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('isValidEmail', () => {
  it.each(['a@b.co', 'jane.doe@example.com', 'x+tag@sub.domain.org'])('accepts %s', (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each(['', 'plainaddress', 'no@dot', '@no-local.com', 'spaces in@email.com'])(
    'rejects %s',
    (email) => {
      expect(isValidEmail(email)).toBe(false);
    },
  );
});
