// Lightweight procedural audio engine (Web Audio API).
// Generates gentle "kawaii" background music and sound effects entirely in
// code — no audio files, no licensing concerns, no repository bloat.

type Wave = OscillatorType;

interface NoteOpts {
    type?: Wave;
    gain?: number;
    dest?: AudioNode;
    attack?: number;
    release?: number;
    glideTo?: number;
}

class AudioEngine {
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;
    private sfxGain: GainNode | null = null;
    private bgmGain: GainNode | null = null;

    private bgmTimer: ReturnType<typeof setTimeout> | null = null;
    private bgmStartTime = 0;
    private bgmPlaying = false;

    private muted = false;
    private unlocked = false;

    private ensure(): AudioContext | null {
        if (typeof window === 'undefined') return null;
        if (!this.ctx) {
            const Ctor =
                window.AudioContext ||
                (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!Ctor) return null;

            this.ctx = new Ctor();

            this.master = this.ctx.createGain();
            this.master.gain.value = this.muted ? 0 : 1;
            this.master.connect(this.ctx.destination);

            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.value = 0.9;
            this.sfxGain.connect(this.master);

            // BGM runs through a gentle low-pass for a soft, warm tone.
            this.bgmGain = this.ctx.createGain();
            this.bgmGain.gain.value = 0.5;
            const lp = this.ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 1600;
            lp.Q.value = 0.3;
            this.bgmGain.connect(lp);
            lp.connect(this.master);
        }
        if (this.ctx.state === 'suspended') void this.ctx.resume();
        return this.ctx;
    }

    get isMuted(): boolean {
        return this.muted;
    }

    /** Toggle global mute. Persisting the preference is the caller's job. */
    setMuted(m: boolean): void {
        this.muted = m;
        if (this.ctx && this.master) {
            this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.02);
        }
        if (m) this.stopBGM();
        else this.startBGM();
    }

    /** Call from a user gesture to unlock the AudioContext and begin BGM. */
    resume(): void {
        const ctx = this.ensure();
        if (!ctx) return;
        this.unlocked = true;
        if (!this.muted) this.startBGM();
    }

    private note(freq: number, start: number, dur: number, opts: NoteOpts = {}): void {
        if (!this.ctx) return;
        const dest = opts.dest ?? this.sfxGain;
        if (!dest) return;
        const { type = 'triangle', gain = 0.2, attack = 0.01, release = 0.12, glideTo } = opts;

        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, start);
        if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + dur);

        g.gain.setValueAtTime(0.0001, start);
        g.gain.linearRampToValueAtTime(gain, start + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, start + dur + release);

        osc.connect(g);
        g.connect(dest);
        osc.start(start);
        osc.stop(start + dur + release + 0.05);
    }

    private noiseSwish(start: number, dur: number, gain = 0.12): void {
        if (!this.ctx || !this.sfxGain) return;
        const length = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
        const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(1200, start);
        bp.frequency.exponentialRampToValueAtTime(3200, start + dur);
        bp.Q.value = 0.8;

        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, start);
        g.gain.linearRampToValueAtTime(gain, start + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, start + dur);

        src.connect(bp);
        bp.connect(g);
        g.connect(this.sfxGain);
        src.start(start);
        src.stop(start + dur + 0.02);
    }

    // ---- Sound effects ----
    playMove(): void {
        const ctx = this.ensure();
        if (!ctx) return;
        this.note(523.25, ctx.currentTime, 0.06, { type: 'sine', gain: 0.18, glideTo: 392, release: 0.08 });
    }

    playDraw(): void {
        const ctx = this.ensure();
        if (!ctx) return;
        this.noiseSwish(ctx.currentTime, 0.12, 0.12);
    }

    playFoundation(): void {
        const ctx = this.ensure();
        if (!ctx) return;
        const t = ctx.currentTime;
        [523.25, 659.25, 783.99].forEach((f, i) =>
            this.note(f, t + i * 0.07, 0.12, { type: 'triangle', gain: 0.16 }),
        );
    }

    playInvalid(): void {
        const ctx = this.ensure();
        if (!ctx) return;
        this.note(220, ctx.currentTime, 0.1, { type: 'sine', gain: 0.1, glideTo: 160, release: 0.06 });
    }

    playUndo(): void {
        const ctx = this.ensure();
        if (!ctx) return;
        this.note(392, ctx.currentTime, 0.08, { type: 'sine', gain: 0.14, glideTo: 523.25, release: 0.06 });
    }

    playHint(): void {
        const ctx = this.ensure();
        if (!ctx) return;
        const t = ctx.currentTime;
        this.note(880, t, 0.12, { type: 'triangle', gain: 0.14 });
        this.note(1174.66, t + 0.08, 0.14, { type: 'triangle', gain: 0.12 });
    }

    playWin(): void {
        const ctx = this.ensure();
        if (!ctx) return;
        const t = ctx.currentTime;
        const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
        scale.forEach((f, i) => this.note(f, t + i * 0.1, 0.18, { type: 'triangle', gain: 0.18 }));
        [523.25, 659.25, 783.99, 1046.5].forEach((f) =>
            this.note(f, t + scale.length * 0.1, 0.6, { type: 'sine', gain: 0.12, release: 0.4 }),
        );
    }

    // ---- Background music (gentle I–vi–IV–V loop, C major pentatonic flavour) ----
    private readonly STEP = 0.42; // seconds per step
    private readonly melody: (number | null)[] = [
        329.63, 392.0, 523.25, 392.0, // C major
        261.63, 329.63, 440.0, 329.63, // A minor
        261.63, 349.23, 440.0, 349.23, // F major
        293.66, 392.0, 493.88, 392.0, // G major
    ];
    private readonly bass: (number | null)[] = [
        130.81, null, null, null,
        220.0, null, null, null,
        174.61, null, null, null,
        196.0, null, null, null,
    ];

    startBGM(): void {
        if (this.muted || !this.unlocked) return;
        const ctx = this.ensure();
        if (!ctx || this.bgmPlaying) return;
        this.bgmPlaying = true;
        this.bgmStartTime = ctx.currentTime + 0.15;
        this.scheduleLoop();
    }

    private scheduleLoop = (): void => {
        if (!this.bgmPlaying || !this.bgmGain) return;
        const steps = this.melody.length;
        const loopStart = this.bgmStartTime;
        for (let i = 0; i < steps; i++) {
            const when = loopStart + i * this.STEP;
            const m = this.melody[i];
            if (m) {
                this.note(m, when, this.STEP * 0.9, {
                    type: 'triangle',
                    gain: 0.1,
                    dest: this.bgmGain,
                    attack: 0.04,
                    release: 0.25,
                });
            }
            const b = this.bass[i];
            if (b) {
                this.note(b, when, this.STEP * 3.6, {
                    type: 'sine',
                    gain: 0.12,
                    dest: this.bgmGain,
                    attack: 0.05,
                    release: 0.3,
                });
            }
        }
        const loopDur = steps * this.STEP;
        this.bgmStartTime = loopStart + loopDur;
        this.bgmTimer = setTimeout(this.scheduleLoop, (loopDur - 0.2) * 1000);
    };

    stopBGM(): void {
        this.bgmPlaying = false;
        if (this.bgmTimer) {
            clearTimeout(this.bgmTimer);
            this.bgmTimer = null;
        }
    }
}

export const audio = new AudioEngine();
