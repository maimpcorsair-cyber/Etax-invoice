interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleAccountsIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
}

interface GoogleAccountsButtonConfiguration {
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  width?: string | number;
  logo_alignment?: 'left' | 'center';
}

interface Window {
  google?: {
    accounts: {
      id: {
        initialize: (config: GoogleAccountsIdConfiguration) => void;
        renderButton: (
          parent: HTMLElement,
          options: GoogleAccountsButtonConfiguration,
        ) => void;
        disableAutoSelect: () => void;
      };
    };
  };
}
