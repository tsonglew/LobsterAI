import { ProviderName } from '@shared/providers';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { type AppConfig, CONFIG_KEYS, defaultConfig } from '../config';

const makeLegacyConfigWithoutMiniMaxM3 = (): AppConfig => ({
  ...defaultConfig,
  providers: {
    ...defaultConfig.providers,
    [ProviderName.Minimax]: {
      ...defaultConfig.providers![ProviderName.Minimax],
      enabled: true,
      apiKey: 'sk-minimax',
      models: defaultConfig.providers![ProviderName.Minimax].models?.filter(
        model => model.id !== 'MiniMax-M3'
      ),
    },
  },
});

const makeLegacyConfigWithDeepSeekV4WithoutContextWindow = (): AppConfig => ({
  ...defaultConfig,
  providers: {
    ...defaultConfig.providers,
    [ProviderName.DeepSeek]: {
      ...defaultConfig.providers![ProviderName.DeepSeek],
      enabled: true,
      apiKey: 'sk-deepseek',
      models: [
        { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', supportsImage: false },
        { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', supportsImage: false },
      ],
    },
  },
});

const makeLegacyConfigWithOldMimoModels = (): AppConfig => ({
  ...defaultConfig,
  providers: {
    ...defaultConfig.providers,
    [ProviderName.Xiaomi]: {
      ...defaultConfig.providers![ProviderName.Xiaomi],
      enabled: true,
      apiKey: 'sk-xiaomi',
      models: [
        { id: 'mimo-v2-pro', name: 'MiMo V2 Pro', supportsImage: false, contextWindow: 128_000 },
        { id: 'mimo-v2-flash', name: 'MiMo V2 Flash', supportsImage: false, contextWindow: 64_000 },
      ],
    },
  },
});

const makeConfigWithCustomContextWindows = (): AppConfig => ({
  ...defaultConfig,
  providers: {
    ...defaultConfig.providers,
    [ProviderName.Minimax]: {
      ...defaultConfig.providers![ProviderName.Minimax],
      enabled: true,
      apiKey: 'sk-minimax',
      models: [
        { id: 'MiniMax-M3', name: 'MiniMax M3', supportsImage: false, contextWindow: 512_000 },
      ],
    },
    [ProviderName.DeepSeek]: {
      ...defaultConfig.providers![ProviderName.DeepSeek],
      enabled: true,
      apiKey: 'sk-deepseek',
      models: [
        { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', supportsImage: false, contextWindow: 256_000 },
        { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', supportsImage: false, contextWindow: 384_000 },
      ],
    },
    [ProviderName.Xiaomi]: {
      ...defaultConfig.providers![ProviderName.Xiaomi],
      enabled: true,
      apiKey: 'sk-xiaomi',
      models: [
        { id: 'mimo-v2.5-pro', name: 'MiMo V2.5 Pro', supportsImage: false, contextWindow: 640_000 },
        { id: 'mimo-v2.5', name: 'MiMo V2.5', supportsImage: true, contextWindow: 768_000 },
      ],
    },
  },
});

async function loadConfigServiceWithStoredConfig(storedConfig: AppConfig) {
  vi.resetModules();
  const storeData: Record<string, unknown> = {
    [CONFIG_KEYS.APP_CONFIG]: storedConfig,
  };
  const getItem = vi.fn(async (key: string) => storeData[key] ?? null);
  const setItem = vi.fn(async (key: string, value: unknown) => {
    storeData[key] = value;
  });

  vi.doMock('./store', () => ({
    localStore: {
      getItem,
      setItem,
      removeItem: vi.fn(),
    },
  }));

  (globalThis as unknown as { window?: unknown }).window = {
    dispatchEvent: vi.fn(),
  };

  const { configService } = await import('./config');
  return { configService, storeData, setItem };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock('./store');
  delete (globalThis as { window?: unknown }).window;
});

describe('configService provider migrations', () => {
  test('persists injected provider models during init', async () => {
    const { configService, storeData, setItem } = await loadConfigServiceWithStoredConfig(
      makeLegacyConfigWithoutMiniMaxM3()
    );

    await configService.init();

    const savedConfig = storeData[CONFIG_KEYS.APP_CONFIG] as AppConfig;
    expect(savedConfig.providers?.[ProviderName.Minimax].models?.[0]).toMatchObject({
      id: 'MiniMax-M3',
      contextWindow: 1_000_000,
    });
    expect(setItem).toHaveBeenCalledWith(CONFIG_KEYS.APP_CONFIG, expect.any(Object));
  });

  test('preserves injected provider models when saving partial config updates', async () => {
    const legacyConfig = makeLegacyConfigWithoutMiniMaxM3();
    const { configService, storeData } = await loadConfigServiceWithStoredConfig(legacyConfig);

    await configService.updateConfig({
      model: {
        ...legacyConfig.model,
        defaultModel: 'MiniMax-M3',
        defaultModelProvider: ProviderName.Minimax,
      },
    });

    const savedConfig = storeData[CONFIG_KEYS.APP_CONFIG] as AppConfig;
    expect(savedConfig.providers?.[ProviderName.Minimax].models?.map(model => model.id)).toContain('MiniMax-M3');
    expect(savedConfig.model.defaultModel).toBe('MiniMax-M3');
    expect(savedConfig.model.defaultModelProvider).toBe(ProviderName.Minimax);
  });

  test('fills DeepSeek V4 context windows when saving partial config updates', async () => {
    const legacyConfig = makeLegacyConfigWithDeepSeekV4WithoutContextWindow();
    const { configService, storeData } = await loadConfigServiceWithStoredConfig(legacyConfig);

    await configService.updateConfig({
      model: {
        ...legacyConfig.model,
        defaultModel: 'deepseek-v4-flash',
        defaultModelProvider: ProviderName.DeepSeek,
      },
    });

    const savedConfig = storeData[CONFIG_KEYS.APP_CONFIG] as AppConfig;
    expect(savedConfig.providers?.[ProviderName.DeepSeek].models).toEqual([
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', supportsImage: false, contextWindow: 1_000_000 },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', supportsImage: false, contextWindow: 1_000_000 },
    ]);
  });

  test('preserves old MiMo models while injecting V2.5 models and 1M contexts', async () => {
    const legacyConfig = {
      ...makeLegacyConfigWithOldMimoModels(),
      model: {
        ...defaultConfig.model,
        defaultModel: 'mimo-v2-pro',
        defaultModelProvider: ProviderName.Xiaomi,
      },
    };
    const { configService, storeData } = await loadConfigServiceWithStoredConfig(legacyConfig);

    await configService.init();

    const savedConfig = storeData[CONFIG_KEYS.APP_CONFIG] as AppConfig;
    expect(savedConfig.providers?.[ProviderName.Xiaomi].models).toEqual([
      { id: 'mimo-v2.5-pro', name: 'MiMo V2.5 Pro', supportsImage: false, contextWindow: 1_000_000 },
      { id: 'mimo-v2.5', name: 'MiMo V2.5', supportsImage: true, contextWindow: 1_000_000 },
      { id: 'mimo-v2-pro', name: 'MiMo V2 Pro', supportsImage: false, contextWindow: 128_000 },
      { id: 'mimo-v2-flash', name: 'MiMo V2 Flash', supportsImage: false, contextWindow: 64_000 },
    ]);
    expect(savedConfig.model.defaultModel).toBe('mimo-v2-pro');
    expect(savedConfig.model.defaultModelProvider).toBe(ProviderName.Xiaomi);
  });

  test('preserves user-configured context windows for known models', async () => {
    const { configService, storeData } = await loadConfigServiceWithStoredConfig(
      makeConfigWithCustomContextWindows()
    );

    await configService.init();

    const savedConfig = storeData[CONFIG_KEYS.APP_CONFIG] as AppConfig;
    expect(savedConfig.providers?.[ProviderName.Minimax].models?.find(model => model.id === 'MiniMax-M3')?.contextWindow).toBe(512_000);
    expect(savedConfig.providers?.[ProviderName.DeepSeek].models?.find(model => model.id === 'deepseek-v4-flash')?.contextWindow).toBe(256_000);
    expect(savedConfig.providers?.[ProviderName.DeepSeek].models?.find(model => model.id === 'deepseek-v4-pro')?.contextWindow).toBe(384_000);
    expect(savedConfig.providers?.[ProviderName.Xiaomi].models?.find(model => model.id === 'mimo-v2.5-pro')?.contextWindow).toBe(640_000);
    expect(savedConfig.providers?.[ProviderName.Xiaomi].models?.find(model => model.id === 'mimo-v2.5')?.contextWindow).toBe(768_000);
  });
});
