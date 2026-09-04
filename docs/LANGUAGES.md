# Language Support — VyaparVaani

## 18 Language Modes

VyaparVaani supports 18 language modes with a centralized registry, per-provider locale mapping, script-aware detection, and honest status labeling.

| Code | Name | Native | Script | Direction | STT | TTS | Translation | Status |
|------|------|--------|--------|-----------|-----|-----|-------------|--------|
| hi | Hindi | हिन्दी | Devanagari | LTR | ✅ | ✅ | ✅ | mock/demo |
| hing | Hinglish | Hinglish | Roman + Devanagari | LTR | ✅ | ✅ | ✅ | mock/demo |
| en | English | English | Latin | LTR | ✅ | ✅ | ✅ | mock/demo |
| bn | Bengali | বাংলা | Bengali | LTR | ✅ | ✅ | ✅ | mock/demo |
| mr | Marathi | मराठी | Devanagari | LTR | ✅ | ✅ | ✅ | mock/demo |
| te | Telugu | తెలుగు | Telugu | LTR | ✅ | ✅ | ✅ | mock/demo |
| ta | Tamil | தமிழ் | Tamil | LTR | ✅ | ✅ | ✅ | mock/demo |
| gu | Gujarati | ગુજરાતી | Gujarati | LTR | ✅ | ✅ | ✅ | mock/demo |
| kn | Kannada | ಕನ್ನಡ | Kannada | LTR | ✅ | ✅ | ✅ | mock/demo |
| ml | Malayalam | മലയാളം | Malayalam | LTR | ✅ | ✅ | ✅ | mock/demo |
| pa | Punjabi | ਪੰਜਾਬੀ | Gurmukhi | LTR | ✅ | ✅ | ✅ | mock/demo |
| or | Odia | ଓଡ଼ିଆ | Odia | LTR | ✅ | ✅ | ✅ | mock/demo |
| as | Assamese | অসমীয়া | Bengali/Assamese | LTR | ✅ | ✅ | ✅ | translation-only |
| ur | Urdu | اردو | Arabic (Nastaliq) | RTL | ✅ | ✅ | ✅ | mock/demo |
| bho | Bhojpuri | भोजपुरी | Devanagari | LTR | ✅ | ✅ | ✅ | translation-only |
| mai | Maithili | मैथिली | Devanagari | LTR | ✅ | ✅ | ✅ | translation-only |
| gom | Konkani | कोंकणी | Devanagari | LTR | ✅ | ✅ | ✅ | translation-only |
| ks | Kashmiri | कश्मीरी | Devanagari/Perso-Arabic | LTR | ✅ | ✅ | ✅ | translation-only |

### Status Labels

- **Fully supported**: STT + TTS verified with real providers
- **Mock/demo mode**: Using mock adapter (clearly marked)
- **STT-only**: Speech-to-text available, no TTS
- **TTS-only**: Text-to-speech available, no STT
- **Translation-only**: Content templates available, no direct STT/TTS
- **Not configured**: No provider set up

## Architecture

### Registry (`server/services/languageRegistry.js`)
Central source of truth for all 18 languages. Contains:
- Language metadata (name, nativeName, script, direction)
- Per-provider locale mappings (Deepgram, ElevenLabs, Google, OpenAI, Web Speech)
- Status computation based on environment variables
- Devanagari→Roman transliteration
- `list()`, `get()`, `localeFor()`, `statusOf()`, `transliterate()`

### Detection (`server/services/language.js`)
Script-aware language detection supporting all 18 scripts/lexicons:
- Unicode range detection for each script
- Distinctive-word lexicons for Devanagari-family disambiguation
- Hinglish roman detection
- Explicit native-name markers (e.g., मराठी→mr)
- `resolveReplyLang()` for response language resolution

### AI Engine (`server/services/aiEngine.js`)
Multilingual reply templates in all 18 languages:
- `T{}` reply dict with greetings, help, fallbacks
- `CONTENT{}` templates for promotions, captions, follow-ups
- `CONCEPTS{}` for domain-specific translations
- Language-aware response resolution with lock/follow modes

### Client Registry (`public/js/lib/language-registry.js`)
Client-side mirror for instant detection and transliteration:
- Script detection for all 18 scripts
- Devanagari→Roman transliteration
- Language guessing from text
- Status badge rendering

## Provider Locale Mappings

| Language | Deepgram | ElevenLabs | Google | OpenAI | Web Speech |
|----------|----------|------------|--------|--------|------------|
| hi | hi | hi | hi-IN | hi | hi-IN |
| hing | hi | hi | hi-IN | hi | hi-IN |
| en | en | en | en-IN | en | en-IN |
| bn | bn | bn | bn-IN | bn | bn-IN |
| mr | mr | mr | mr-IN | mr | mr-IN |
| te | te | te | te-IN | te | te-IN |
| ta | ta | ta | ta-IN | ta | ta-IN |
| gu | gu | gu | gu-IN | gu | gu-IN |
| kn | kn | kn | kn-IN | kn | kn-IN |
| ml | ml | ml | ml-IN | ml | ml-IN |
| pa | pa | pa | pa-IN | pa | pa-IN |
| or | or | or | or-IN | or | or-IN |
| as | as | as | as-IN | as | as-IN |
| ur | ur | ur | ur-IN | ur | ur-IN |
| bho | hi | hi | hi-IN | hi | hi-IN |
| mai | hi | hi | hi-IN | hi | hi-IN |
| gom | mr | mr | mr-IN | mr | mr-IN |
| ks | hi | hi | hi-IN | hi | hi-IN |

## Code-Switching

The voice AI supports natural code-switching (mixing languages in one sentence):

1. **Client detection**: Each speech segment is analyzed for script and language
2. **Server resolution**: `resolveReplyLang()` determines response language based on:
   - `lockResponseLang`: If true, always reply in preferred language
   - `allowSwitch`: If false, never switch based on detected language
   - `detected`: The language detected from the user's utterance
   - `preferred`: The user's configured preferred language
3. **LLM handling**: The AI understands mixed-language input and responds coherently

### Detection Priority
1. Native script tokens (e.g., Devanagari, Bengali, Tamil) → immediate identification
2. Distinctive words for Devanagari-family disambiguation
3. Roman script with Hinglish markers → Hinglish
4. Pure Roman script → English

## API Endpoints

- `GET /api/languages` — Full registry with status, locales, voices
- `POST /api/language/detect` — Detect language from text
- `GET /api/language/voices` — Voice previews per language
- `GET /api/demo/conversations` — Demo starters for all 18 modes
- `GET /api/config` — Config includes language list with status
