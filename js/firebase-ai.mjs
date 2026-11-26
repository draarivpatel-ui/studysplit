import { demoGenerate } from './core/demo.mjs';

export const FIREBASE_SDK_VERSION = '13.0.0';
export const FIREBASE_APP_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`;
export const FIREBASE_AI_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-ai.js`;
export const FIREBASE_APP_CHECK_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-check.js`;

export const CARD_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string', nullable: false },
          answer: { type: 'string', nullable: false },
          difficulty: { type: 'string', nullable: false },
          tags: {
            type: 'array',
            items: { type: 'string', nullable: false },
            nullable: false
          }
        },
        nullable: false,
        required: ['question', 'answer', 'difficulty']
      },
      nullable: false
    }
  },
  nullable: false,
  required: ['cards']
};

export function buildCardPrompt(notes) {
  return [
    'Turn these lecture notes into atomic flashcards.',
    'Return only JSON matching the schema.',
    'Each card must test one fact, use a concise question, and keep the answer self-contained.',
    'Use difficulty values easy, medium, or hard.',
    'Collapse exact duplicates and do not invent facts.',
    '',
    String(notes ?? '')
  ].join('\n');
}

export function normalizeFirebaseConfig(raw = {}) {
  const firebase = raw.firebase && typeof raw.firebase === 'object' ? raw.firebase : raw;
  const required = ['apiKey', 'projectId', 'appId'];
  const hasRealConfig = required.every((key) => {
    const value = String(firebase?.[key] ?? '').trim();
    return value.length > 0 && !/paste|replace|example|your/i.test(value);
  });
  return {
    demoMode: raw.demoMode === true || !hasRealConfig,
    firebase: {
      apiKey: String(firebase?.apiKey ?? ''),
      authDomain: String(firebase?.authDomain ?? ''),
      projectId: String(firebase?.projectId ?? ''),
      storageBucket: String(firebase?.storageBucket ?? ''),
      messagingSenderId: String(firebase?.messagingSenderId ?? ''),
      appId: String(firebase?.appId ?? '')
    },
    cloudModel: String(raw.cloudModel || 'gemini-3.5-flash-lite'),
    appCheck: {
      mode: raw.appCheck?.mode === 'recaptcha' ? 'recaptcha' : 'debug',
      recaptchaSiteKey: String(raw.appCheck?.recaptchaSiteKey ?? '')
    }
  };
}

export async function loadFirebaseConfig(url = './firebase-config.json') {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    return normalizeFirebaseConfig({ demoMode: true });
  }
  return normalizeFirebaseConfig(await response.json());
}

export async function createFirebaseAiEngine(configInput) {
  const config = normalizeFirebaseConfig(configInput);
  if (config.demoMode) {
    return {
      kind: 'demo',
      config,
      async initialize() {
        return { status: 'demo', detail: 'deterministic local demo runner' };
      },
      async generate(input) {
        return {
          text: JSON.stringify({ cards: demoGenerate(input.notes).cards }),
          inferenceSource: input.requestedLeg === 'on-device' ? 'on_device' : 'in_cloud',
          model: 'demo'
        };
      }
    };
  }

  const [{ initializeApp }, aiModule, appCheckModule] = await Promise.all([
    import(FIREBASE_APP_URL),
    import(FIREBASE_AI_URL),
    import(FIREBASE_APP_CHECK_URL)
  ]);
  const {
    getAI,
    getGenerativeModel,
    GoogleAIBackend,
    InferenceMode
  } = aiModule;
  const { initializeAppCheck, ReCaptchaV3Provider } = appCheckModule;

  if (!config.appCheck.recaptchaSiteKey) {
    throw new Error('Firebase mode requires appCheck.recaptchaSiteKey so App Check can be initialized');
  }
  if (config.appCheck.mode === 'debug') {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  const firebaseApp = initializeApp(config.firebase);
  initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaV3Provider(config.appCheck.recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true
  });

  const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });
  const inCloudParams = {
    model: config.cloudModel,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: CARD_RESPONSE_SCHEMA,
      maxOutputTokens: 4096
    }
  };
  const onDeviceParams = {
    createOptions: {
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }]
    },
    promptOptions: {
      responseConstraint: CARD_RESPONSE_SCHEMA
    }
  };
  const hybridModel = getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    inCloudParams,
    onDeviceParams
  });
  const cloudModel = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams
  });

  return {
    kind: 'firebase',
    config,
    model: hybridModel,
    cloudModel,
    async initialize(onProgress) {
      if (typeof hybridModel.initializeDeviceModel !== 'function') {
        return { status: 'unsupported', detail: 'initializeDeviceModel is not exposed by this SDK build' };
      }
      return hybridModel.initializeDeviceModel((value) => {
        if (typeof onProgress === 'function') onProgress(value);
      });
    },
    async generate(input) {
      const targetModel = input.requestedLeg === 'cloud' ? cloudModel : hybridModel;
      const result = await targetModel.generateContent(buildCardPrompt(input.notes));
      return {
        text: result.response.text(),
        inferenceSource: result.response.inferenceSource || null,
        model: config.cloudModel,
        raw: result
      };
    }
  };
}
