# Feras Mobile Build Context

```yaml
mobile:
  platform: react-native
  wallet_method: mwa
  scaffold_repo: existing-expo-router-sdk-57
  physical_device_tested: false
distribution:
  primary: solana-dapp-store
  production_platform: android
  ios_role: expo-go-ui-preview
solana:
  cluster: devnet
  client: solana-kit
  asset: Simulated USDC in Expo Go; configured USDC mint on devnet
  asset_value: valueless
```

The production wallet path is Android Mobile Wallet Adapter in a custom Expo
development build. Expo Go on the iPhone is a UI and state-flow preview only;
it must never present a preview receipt as an on-chain signature.
