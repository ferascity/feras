import Constants, { ExecutionEnvironment } from 'expo-constants';

// react-native-quick-crypto requires custom native C++ binaries that are not
// available in the standard Expo Go client app. Only load it in standalone / dev builds.
const isExpoGo =
  Constants.appOwnership === 'expo' ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { install } = require('react-native-quick-crypto');
    if (typeof install === 'function') {
      install();
    }
  } catch {
    // Graceful fallback if native JSI bindings are not linked in the current environment
  }
}

