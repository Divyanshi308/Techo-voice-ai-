/* pixel-avatars.js — six distinct animated human personas for Avatar Mode.
 *
 * Each persona is a procedural pixel humanoid (no images, offline-safe):
 * distinct hair, skin, clothing, colour identity, personality, specialty,
 * greeting and a unique catalog voice ID (always different per persona).
 * Animation states map to real voice states from the app:
 *   idle, mic, listening, processing, speaking (lip-sync), muted,
 *   disconnected, langswitch, escalate, expert, completed.
 *
 * The drawing is pure pixel art with restrained motion: subtle breathing bob,
 * blinking, occasional head look, and mouth shapes driven by mic/audio level.
 */

const PixelAvatars = (() => {
  'use strict';

  const VOICE = {
    v_roopa:   { name: 'Roopa', gender: 'feminine', lang: 'hi', pitch: 1.05, rate: 1 },
    v_vicky:   { name: 'Vicky', gender: 'masculine', lang: 'en', pitch: 0.9, rate: 1.02 },
    v_arjun:   { name: 'Arjun', gender: 'masculine', lang: 'hi', pitch: 0.9, rate: 1 },
    v_linda:   { name: 'Linda', gender: 'feminine', lang: 'en', pitch: 1, rate: 1 },
    v_sherni:  { name: 'Sherni', gender: 'feminine', lang: 'pa', pitch: 1, rate: 1.05 },
    v_neutral: { name: 'Naya', gender: 'neutral', lang: 'hing', pitch: 1, rate: 1 }
  };

  const PERSONAS = [
    {
      id: 'p_mentor', name: 'Rita', role: 'Business Mentor',
      color: '#14B8A6', color2: '#F59E0B', skin: '#E8B88A', hair: '#3B2C1E', hairStyle: 'bun',
      gender: 'feminine', voiceId: 'v_roopa',
      personality: 'Warm, patient and encouraging. Speaks simply and always celebrates small wins before giving advice.',
      specialty: 'Everyday shop decisions — stock, pricing, daily cash, vendor payments, GST basics.',
      greeting: 'Hello! I’m Rita. Tell me about your shop today — sales, stock, or anything worrying you.',
      langHint: 'hi'
    },
    {
      id: 'p_advisor', name: 'Kabir', role: 'Startup Advisor',
      color: '#8B5CF6', color2: '#14B8A6', skin: '#C98A5E', hair: '#16121A', hairStyle: 'spike',
      gender: 'masculine', voiceId: 'v_vicky',
      personality: 'Energetic and direct. Thinks in milestones, MVPs and growth — gets you moving fast.',
      specialty: 'Starting up, business ideas, growth plans, digital presence, funding basics.',
      greeting: 'Hey — Kabir here. Let’s turn your idea into a plan you can start today.',
      langHint: 'en'
    },
    {
      id: 'p_educator', name: 'Anand', role: 'Financial Educator',
      color: '#1E3A8A', color2: '#F59E0B', skin: '#D9A678', hair: '#22201E', hairStyle: 'short',
      gender: 'masculine', voiceId: 'v_arjun',
      personality: 'Calm, precise and trustworthy. Explains money clearly and never guesses numbers.',
      specialty: 'Accounting, profit and loss, GST filings, loans, savings and investment basics.',
      greeting: 'Namaste, I’m Anand. Let’s sort your numbers — income, expenses, and where money can grow.',
      langHint: 'hi'
    },
    {
      id: 'p_support', name: 'Meera', role: 'Customer Support',
      color: '#F59E0B', color2: '#8B5CF6', skin: '#EBC190', hair: '#331F0E', hairStyle: 'pony',
      gender: 'feminine', voiceId: 'v_linda',
      personality: 'Friendly, reassuring and quick to act. Good at turning complaints into solutions.',
      specialty: 'Customer queries, refunds, complaints, after-sales care and repeat buyers.',
      greeting: 'Hi, I’m Meera. Tell me what a customer needs — I’ll help you answer fast and kindly.',
      langHint: 'en'
    },
    {
      id: 'p_commerce', name: 'Simran', role: 'E-commerce Specialist',
      color: '#22C55E', color2: '#8B5CF6', skin: '#D9A678', hair: '#2A1A0A', hairStyle: 'bun',
      gender: 'feminine', voiceId: 'v_sherni',
      personality: 'Sharp, practical and street-smart. Focused on listings, orders, delivery and repeat sales.',
      specialty: 'Online marketplaces, product listings, packaging, delivery, ratings and reviews.',
      greeting: 'Sat sri akaal! I’m Simran. Let’s boost your online orders — from listing to doorstep.',
      langHint: 'pa'
    },
    {
      id: 'p_community', name: 'Aman', role: 'Multilingual Assistant',
      color: '#64648C', color2: '#F59E0B', skin: '#C98A5E', hair: '#1E1B16', hairStyle: 'short',
      gender: 'neutral', voiceId: 'v_neutral',
      personality: 'Easy-going and multilingual. Switches languages mid-sentence and never loses the thread.',
      specialty: 'Speaking all 18 supported languages, translations, and helping customers in their mother tongue.',
      greeting: 'Namaste! Main Aman hoon — I help you and your customers in any language.',
      langHint: 'hing'
    }
  ];

  const STATE_LABELS = {
    idle: 'Ready to listen', mic: 'Waiting for microphone', listening: 'Listening…',
    processing: 'Thinking…', speaking: 'Speaking…', muted: 'Muted', disconnected: 'Disconnected',
    langswitch: 'Switching language…', escalate: 'Connecting to a human expert…',
    expert: 'Human expert connected', completed: 'Conversation completed',
    error: 'Something went wrong', saving: 'Saving…'
  };

  const STATE_COLORS = {
    idle: '#94A3B8', mic: '#F59E0B', listening: '#14B8A6', processing: '#8B5CF6',
    speaking: '#22C55E', muted: '#94A3B8', disconnected: '#EF4444', langswitch: '#F59E0B',
    escalate: '#F59E0B', expert: '#22C55E', completed: '#22C55E', error: '#EF4444', saving: '#8B5CF6'
  };

  let currentState = 'idle';
  let level = 0;              // 0..1 audio level while speaking
  let selectedId = 'p_mentor';
  let blinkTimer = 0;

  /* ---------------- pixel humanoid painter ---------------- */
  function px(ctx, x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  }

  function drawPersona(ctx, persona, cx, baseY, t, st, lvl) {
    const s = 1;
    const bob = (st === 'idle' || st === 'listening' || st === 'speaking' || st === 'processing')
      ? Math.round(Math.sin(t * 0.09) * 1.2) : 0;
    const y0 = baseY + bob;
    const look = st === 'processing' ? -1 : (st === 'langswitch' ? 1 : 0);
    const crouch = st === 'listening' ? 1 : 0;                       // lean slightly
    const muted = st === 'muted';
    const gray = st === 'disconnected' || st === 'completed' ? 0.55 : 1;

    ctx.save();
    if (gray !== 1) ctx.globalAlpha = gray;
    const cx2 = cx + look * 1.5;
    const top = y0 - 72 * s;

    // --- legs / lower body ---
    const legC = persona.gender === 'feminine' ? persona.color : '#232A3B';
    px(ctx, cx2 - 9 * s, top + 52 * s, 8 * s, 16 * s, legC);
    px(ctx, cx2 + 1 * s, top + 52 * s, 8 * s, 16 * s, legC);
    px(ctx, cx2 - 10 * s, top + 66 * s, 10 * s, 5 * s, '#0B0F1E');
    px(ctx, cx2 + 1 * s, top + 66 * s, 10 * s, 5 * s, '#0B0F1E');

    // --- torso (clothing) ---
    px(ctx, cx2 - 11 * s, top + 34 * s, 22 * s, 20 * s, persona.color);
    // collar / accent stripe
    if (persona.gender === 'feminine') {
      px(ctx, cx2 - 6 * s, top + 34 * s, 12 * s, 3 * s, persona.color2);   // dupatta line
    } else {
      px(ctx, cx2 - 1 * s, top + 34 * s, 2 * s, 8 * s, persona.color2);    // tie
      px(ctx, cx2 - 3 * s, top + 41 * s, 6 * s, 2 * s, persona.color2);
    }
    // buttons
    px(ctx, cx2 - 1 * s, top + 40 * s, 2 * s, 2 * s, '#0B0F1E');
    px(ctx, cx2 - 1 * s, top + 46 * s, 2 * s, 2 * s, '#0B0F1E');

    // --- arms ---
    const armTop = top + 36 * s;
    const lArmX = cx2 - 14 * s, rArmX = cx2 + 12 * s;
    px(ctx, lArmX, armTop, 5 * s, 16 * s, persona.color);
    px(ctx, rArmX, armTop, 5 * s, 16 * s, persona.color);
    px(ctx, lArmX, armTop + 16 * s, 4 * s, 4 * s, persona.skin);
    px(ctx, rArmX, armTop + 16 * s, 4 * s, 4 * s, persona.skin);

    // --- head ---
    const hTop = top + 12 * s;
    px(ctx, cx2 - 9 * s, hTop, 18 * s, 24 * s, persona.skin);          // face
    px(ctx, cx2 - 9 * s, hTop + 2 * s, 1 * s, 18 * s, '#B46F44');      // face shadow edge
    px(ctx, cx2 + 8 * s, hTop + 2 * s, 1 * s, 18 * s, '#B46F44');
    // ears
    px(ctx, cx2 - 10 * s, hTop + 14 * s, 1 * s, 4 * s, persona.skin);
    px(ctx, cx2 + 9 * s, hTop + 14 * s, 1 * s, 4 * s, persona.skin);

    // --- hair ---
    if (persona.hairStyle === 'bun') {
      px(ctx, cx2 - 10 * s, hTop - 3 * s, 20 * s, 5 * s, persona.hair);
      px(ctx, cx2 + 6 * s, hTop - 6 * s, 6 * s, 6 * s, persona.hair);   // bun
      px(ctx, cx2 - 10 * s, hTop - 2 * s, 3 * s, 10 * s, persona.hair); // side hair
    } else if (persona.hairStyle === 'pony') {
      px(ctx, cx2 - 10 * s, hTop - 3 * s, 20 * s, 5 * s, persona.hair);
      px(ctx, cx2 - 10 * s, hTop + 8 * s, 3 * s, 12 * s, persona.hair);
    } else if (persona.hairStyle === 'spike') {
      px(ctx, cx2 - 10 * s, hTop - 3 * s, 20 * s, 4 * s, persona.hair);
      px(ctx, cx2 - 8 * s, hTop - 6 * s, 3 * s, 4 * s, persona.hair);
      px(ctx, cx2 - 1 * s, hTop - 8 * s, 3 * s, 6 * s, persona.hair);
      px(ctx, cx2 + 6 * s, hTop - 5 * s, 3 * s, 4 * s, persona.hair);
    } else {
      px(ctx, cx2 - 10 * s, hTop - 4 * s, 20 * s, 5 * s, persona.hair);
      px(ctx, cx2 - 10 * s, hTop + 2 * s, 3 * s, 6 * s, persona.hair);
    }

    // --- brows + eyes ---
    const eyeY = hTop + 14 * s;
    const blink = (Math.floor(t / 90) + persona.id.charCodeAt(1)) % 7 < 1;   // periodic blink
    if (blink) {
      px(ctx, cx2 - 6 * s, eyeY, 4 * s, 1 * s, persona.hair);
      px(ctx, cx2 + 2 * s, eyeY, 4 * s, 1 * s, persona.hair);
    } else {
      px(ctx, cx2 - 7 * s, eyeY - 2 * s, 5 * s, 1 * s, persona.hair);
      px(ctx, cx2 + 2 * s, eyeY - 2 * s, 5 * s, 1 * s, persona.hair);
      px(ctx, cx2 - 5 * s, eyeY + (st === 'thinking' ? 0 : 0), 2 * s, 2 * s, '#0B0F1E');
      px(ctx, cx2 + 3 * s, eyeY, 2 * s, 2 * s, '#0B0F1E');
    }

    // --- mouth (lip-sync) ---
    const mouthY = hTop + 21 * s;
    if (st === 'speaking') {
      const open = Math.max(1, Math.round(1 + lvl * 3 * s));
      px(ctx, cx2 - 2 * s, mouthY, 5 * s, open, persona.color2);
    } else if (st === 'listening') {
      px(ctx, cx2 - 2 * s, mouthY, 5 * s, 1 * s, '#0B0F1E');
      // subtle "I'm listening" tilt
    } else if (st === 'processing' || st === 'langswitch') {
      px(ctx, cx2 - 1 * s, mouthY - 1 * s, 2 * s, 2 * s, '#0B0F1E');   // thinking mouth
    } else {
      px(ctx, cx2 - 2 * s, mouthY, 4 * s, 1 * s, '#0B0F1E');
    }

    // --- state embellishments ---
    if (st === 'listening') {
      px(ctx, cx2 - 6 * s, eyeY - 4 * s, 3 * s, 2 * s, persona.color2);   // bright earring/glow
    }
    if (st === 'muted') {
      ctx.strokeStyle = '#EF4444'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx2 - 14 * s, hTop - 6 * s);
      ctx.lineTo(cx2 + 14 * s, hTop + 28 * s);
      ctx.stroke();
    }
    if (st === 'escalate' || st === 'expert') {
      px(ctx, cx2 - 16 * s, hTop - 10 * s, 12 * s, 8 * s, persona.color2);   // phone bubble
      px(ctx, cx2 - 13 * s, hTop - 8 * s, 6 * s, 4 * s, '#0B0F1E');
    }
    ctx.restore();
  }

  /* ---------------- render to a canvas element ---------------- */
  function render(canvas, persona, t, st, lvl) {
    if (!canvas || !persona) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // fit the full humanoid (logical ~64x88) inside the canvas
    const scale = Math.min(canvas.width / 70, canvas.height / 88);
    ctx.save();
    ctx.scale(scale, scale);
    const cx = 35, baseY = 88;
    const offsetX = (canvas.width / scale - 70) / 2;
    drawPersona(ctx, persona, cx + offsetX, baseY, t, st || currentState, lvl || level);
    ctx.restore();
  }

  /* ---------------- state + selection API ---------------- */
  function setState(s) {
    if (!STATE_LABELS[s]) s = 'idle';
    currentState = s;
    emit();
  }
  function setLevel(l) {
    level = Math.max(0, Math.min(1, l || 0));
  }
  function getState() { return currentState; }
  function label(s) { return STATE_LABELS[s || currentState] || STATE_LABELS.idle; }
  function color(s) { return STATE_COLORS[s || currentState] || STATE_COLORS.idle; }

  function select(id) {
    const p = PERSONAS.find((x) => x.id === id);
    if (!p) return null;
    selectedId = id;
    try { localStorage.setItem('vv-persona', id); } catch (e) { /* ignore */ }
    emit();
    return p;
  }
  function getSelected() {
    return (PERSONAS.find((x) => x.id === selectedId)) || PERSONAS[0];
  }
  function initialize() {
    try {
      const saved = (typeof localStorage !== 'undefined') && localStorage.getItem('vv-persona');
      if (saved && PERSONAS.some((x) => x.id === saved)) selectedId = saved;
    } catch (e) { /* ignore */ }
  }
  function voiceOf(persona) {
    return VOICE[persona.voiceId] || VOICE.v_neutral;
  }

  const listeners = new Set();
  function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function emit() {
    const p = getSelected();
    listeners.forEach((fn) => { try { fn({ persona: p, state: currentState, label: label(), color: color() }); } catch (e) { /* ignore */ } });
  }

  return {
    personas: PERSONAS,
    initialize, select, getSelected, voiceOf,
    setState, setLevel, getState, label, color, on,
    render, STATE_LABELS
  };
})();

window.PixelAvatars = PixelAvatars;