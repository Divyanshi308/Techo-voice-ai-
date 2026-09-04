'use strict';

/**
 * services/avatar/catalog.js — pre-registered talking-head avatars.
 *
 * These are real HeyGen avatar LOOKS owned by / available to the account
 * (resolved live against GET /v3/avatars/looks). Each `id` is the look id you
 * pass as `avatar_id` to POST /v3/videos. `voiceId` is the look's default voice
 * (used when a per-request voice isn't supplied). Catalog metadata is
 * intentionally free of secrets and safe to serve to the client.
 */

const AVATARS = [
  { id: 'b0c2f707380f492e9ce36b5522198a3d', name: 'Elin Office 8', gender: 'female', desc: 'Warm, professional woman in an office', thumbnail: 'https://resource2.heygen.ai/public-avatars/Elin/paos/angles/Office_8.jpg', voiceId: '0b3e60bbf0504a28b194f7cd7ef594d7', lang: 'en' },
  { id: '257a20550c2b4144ad8256498375abb4', name: 'Kacper Presenter 3', gender: 'male', desc: 'Confident male presenter', thumbnail: 'https://resource2.heygen.ai/public-avatars/Kacper/lookpack/angles/Presenter_3.jpg', voiceId: 'ce272fc2ee3a4b2ea32ac66c98ad17b6', lang: 'en' },
  { id: '7856b161e0a64b1d87535245c8b46941', name: 'Sienna Studio Streamer 2', gender: 'female', desc: 'Energetic female studio streamer', thumbnail: 'https://resource2.heygen.ai/public-avatars/Sienna/lookpack/stills/Studio_Streamer_2.jpg', voiceId: 'fc0b99a1bf6146d1ba75a65f51cfb6eb', lang: 'en' },
  { id: 'ff172d6c499c4e47ba6fcc5de631e9fc', name: 'Mateo Traditional Law Office', gender: 'male', desc: 'Formal male professional', thumbnail: 'https://resource2.heygen.ai/public-avatars/Mateo/first_frames/look_03.png', voiceId: '3ac387764b904999bc7cef501f0d4aa5', lang: 'en' },
  { id: '20552edb920f4bca899b3eaf6ff98a50', name: 'Dev Personal Development Coach 1', gender: 'male', desc: 'Friendly male coach', thumbnail: 'https://resource2.heygen.ai/public-avatars/Dev/angle_pack/personal_development_coach_angle_1.png', voiceId: 'c1665d5110af4d13b7fc800e2dfa6d7d', lang: 'en' },
  { id: 'Giulia_sitting_sofa_front', name: 'Giulia Sofa Front', gender: 'female', desc: 'Calm female presenter on a sofa', thumbnail: 'https://files2.heygen.ai/avatar/v3/c120df50527f4a8e93f2d6fab98aa335_37400/preview_target.webp', voiceId: 'd05627251174456fbf0b4f1542164d8d', lang: 'en' }
];

function all() {
  return AVATARS.map((a) => ({ ...a }));
}

function get(id) {
  if (!id) return null;
  return AVATARS.find((a) => a.id === id) || null;
}

module.exports = { all, get, AVATARS };
