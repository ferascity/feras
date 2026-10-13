import Constants from 'expo-constants';

// react-native-quick-crypto requires native code and therefore cannot be
// installed by Expo Go. Load it before the router only in a custom build.
if (Constants.appOwnership !== 'expo') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { install } = require('react-native-quick-crypto');
  install();
}
