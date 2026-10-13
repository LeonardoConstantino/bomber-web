/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

class SoundManager {
  private ctx: AudioContext | null = null;
  private musicInterval: any = null;
  private isMusicPlaying: boolean = false;
  private volume: number = 0.5; // 0.0 to 1.0
  private sfxVolume: number = 0.6;

  private initContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  setSfxVolume(vol: number) {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
  }

  playClick() {
    this.initContext();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.15 * this.sfxVolume, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  playMove() {
    this.initContext();
    if (!this.ctx) return;
    // Quiet thud
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(80, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.08 * this.sfxVolume, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  playPlantBomb() {
    this.initContext();
    if (!this.ctx) return;
    // Sliding squeak/boop
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, this.ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.2 * this.sfxVolume, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  playExplosion() {
    this.initContext();
    if (!this.ctx || !this.ctx.destination) return;

    const duration = 0.6;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Create White Noise
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseNode = this.ctx.createBufferSource();
    noiseNode.buffer = buffer;

    // Filter white noise to create explosive rumble
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + duration);

    // Dynamic gain envelope
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.5 * this.sfxVolume, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    // Layer a heavy low frequency oscillator synth thud
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sawtooth';
    subOsc.frequency.setValueAtTime(120, this.ctx.currentTime);
    subOsc.frequency.linearRampToValueAtTime(20, this.ctx.currentTime + 0.3);

    subGain.gain.setValueAtTime(0.4 * this.sfxVolume, this.ctx.currentTime);
    subGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.35);

    // Connect noise
    noiseNode.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    // Connect sub
    subOsc.connect(subGain);
    subGain.connect(this.ctx.destination);

    // Start both
    noiseNode.start();
    noiseNode.stop(this.ctx.currentTime + duration);

    subOsc.start();
    subOsc.stop(this.ctx.currentTime + 0.35);
  }

  playPowerUp() {
    this.initContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const scale = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99]; // C Major rising arpeggio

    scale.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);

      gain.gain.setValueAtTime(0, now + idx * 0.06);
      gain.gain.linearRampToValueAtTime(0.18 * this.sfxVolume, now + idx * 0.06 + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + idx * 0.06 + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.15);
    });
  }

  playFreeze() {
    this.initContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Chime glass sounds
    const freqs = [880, 1046.50, 1318.51, 1567.98, 2093.00];
    freqs.forEach((f, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + idx * 0.05);
      gain.gain.setValueAtTime(0.1 * this.sfxVolume, now + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.25);
    });
  }

  playShieldBreak() {
    this.initContext();
    if (!this.ctx) return;
    // Shimmering metal break
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(400, this.ctx.currentTime);
    osc1.frequency.linearRampToValueAtTime(80, this.ctx.currentTime + 0.25);

    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(600, this.ctx.currentTime);
    osc2.frequency.linearRampToValueAtTime(100, this.ctx.currentTime + 0.25);

    gain.gain.setValueAtTime(0.2 * this.sfxVolume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start();
    osc1.stop(this.ctx.currentTime + 0.25);
    osc2.start();
    osc2.stop(this.ctx.currentTime + 0.25);
  }

  playSpecialPower() {
    this.initContext();
    if (!this.ctx) return;
    // Cyber slide for phase shift/remote bomb
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.25);

    gain.gain.setValueAtTime(0.12 * this.sfxVolume, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.25);
  }

  playVictory() {
    this.initContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const melody = [523.25, 523.25, 523.25, 523.25, 659.25, 587.33, 659.25, 783.99, 1046.50];
    const rhythm = [0.08, 0.08, 0.08, 0.16, 0.16, 0.08, 0.08, 0.16, 0.4];

    let accum = 0;
    melody.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now + accum);

      gain.gain.setValueAtTime(0, now + accum);
      gain.gain.linearRampToValueAtTime(0.15 * this.sfxVolume, now + accum + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + accum + rhythm[idx] - 0.01);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + accum);
      osc.stop(now + accum + rhythm[idx]);

      accum += rhythm[idx];
    });
  }

  playDefeat() {
    this.initContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const melody = [392.00, 349.23, 311.13, 261.63, 246.94, 196.00];
    const rhythm = [0.15, 0.15, 0.15, 0.2, 0.2, 0.5];

    let accum = 0;
    melody.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + accum);

      gain.gain.setValueAtTime(0, now + accum);
      gain.gain.linearRampToValueAtTime(0.2 * this.sfxVolume, now + accum + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + accum + rhythm[idx] - 0.01);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + accum);
      osc.stop(now + accum + rhythm[idx]);

      accum += rhythm[idx];
    });
  }

  startMusic() {
    this.initContext();
    if (!this.ctx || this.isMusicPlaying) return;
    this.isMusicPlaying = true;

    let beat = 0;
    // Very simple retro tracker arpeggio
    // Bass loop (C, Am, F, G)
    const baseChords = [
      [130.81, 164.81, 196.00], // C3, E3, G3
      [110.00, 130.81, 164.81], // A2, C3, E3
      [87.31, 130.81, 174.61],  // F2, C3, F3
      [98.00, 146.83, 196.00]   // G2, D3, G3
    ];

    const tempo = 120; // BPM
    const beatDuration = 60 / tempo / 2; // 1/8 note

    this.musicInterval = setInterval(() => {
      if (!this.ctx || !this.isMusicPlaying) return;

      const chordIdx = Math.floor(beat / 8) % 4;
      const step = beat % 8;

      // Synth Bass pluck
      if (step === 0 || step === 4 || step === 6) {
        const root = baseChords[chordIdx][0];
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(root, this.ctx.currentTime);

        gain.gain.setValueAtTime(0.12 * this.volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + beatDuration * 1.5);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + beatDuration * 2);
      }

      // Minimal retro arpeggio lead on offbeats
      if (step % 2 === 1) {
        const note = baseChords[chordIdx][step % 3];
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        // transpose up 2 octaves
        osc.frequency.setValueAtTime(note * 4, this.ctx.currentTime);

        gain.gain.setValueAtTime(0.02 * this.volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + beatDuration * 0.8);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + beatDuration);
      }

      beat++;
    }, beatDuration * 1000);
  }

  stopMusic() {
    this.isMusicPlaying = false;
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }

  isMusicActive(): boolean {
    return this.isMusicPlaying;
  }
}

export const audio = new SoundManager();
