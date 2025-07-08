// csound.js is the Csound WASM module
const csoundjs =
      "https://cdn.jsdelivr.net/npm/@csound/browser@6.18.5/dist/csound.js";
// csound is the Csound engine object (null as we start)
let csound = null;
// audio context
let audio_context = null;
// source URL for assets
const srcurl = "https://vlazzarini.github.io/litePlay.js/";
// CSD file name
const csd = "./litePlay.csd";
const sfont = "./gm.sf2";

// this is the JS function to start Csound
export async function startEngine() {
    // if the Csound object is not initialised
    if (csound == null) {
        // import the Csound method from csound.js
        const { Csound } = await import(csoundjs);
        // create a Csound engine object
        csound = await Csound();
        // get audio context
        audio_context = await csound.getAudioContext();
        // set realtime audio (dac) output
        await csound.setOption("-odac");
        // set realtime MIDI input
        await csound.setOption("-M0");
        // copy the sfont file to the Csound local filesystem
        await copyUrlToLocal(srcurl + sfont, sfont);
        // copy the CSD file to the Csound local filesystem
        await copyUrlToLocal(srcurl + csd, csd);
        // compile csound code
        await csound.compileCsd(csd);
        // start the engine
        await csound.start();
    }
};

// copy URL to local file
async function copyUrlToLocal(src, dest) {
    // fetch the file
    const srcfile = await fetch(src, { cache: "no-store" });
    // get the file data as an array
    const dat = await srcfile.arrayBuffer();
    // write the data as a new file in the filesystem
    await csound.fs.writeFile(dest, new Uint8Array(dat));
}

// generic midi message
export function midi(stat, b1, b2) {
    csound.midiMessage(stat, b1, b2);
}

// midi program message
export function midiProgram(n, chn = 1) {
    if (chn >= 1 && chn <= 16) csound.midiMessage(chn + 191, n, 0);
}

// litePlay.js global parameters
const globalObj = {
    freeChannel: 16, // channels 0 to 15 are for device MIDI
    maxChannel: 100,
    BPM: 60.0,
    sampnum: 0
};

// Csound instrument class
export class Instrument {
    constructor(pgm, isDrums = false, what = 60.0, instr = 10) {
        this.pgm = pgm;
        this.chn = globalObj.freeChannel;
        globalObj.freeChannel =
            globalObj.freeChannel < globalObj.maxChannel - 1 ?
            globalObj.freeChannel + 1 : 16;
        this.isDrums = isDrums;
        this.what_ = what;
        this.howLoud = 1;
        this.howLong = 1;
        this.on = new Uint8Array(128);
        this.instr = instr;
    }

    what(snd) {
        this.what_ = snd;
    }

    score(what, howLoud, when, howLong) {
        let prog = this.pgm;
        let instr = this.instr + what / 1000000 + this.chn / globalObj.maxChannel;
        if (this.isDrums) {
            if (prog == 7) csound.tableSet(26, this.chn, 2); 
            else csound.tableSet(26, this.chn, 0.5);
            if (what == 29 || what == 30) instr = 10.97;
            else if (what == 42 || what == 44 || what == 46 || what == 49)
                instr = 10.91;
            else if (what == 71 || what == 72) instr = 10.92;
            else if (what == 73 || what == 74) instr = 10.93;
            else if (what == 78 || what == 79) instr = 10.94;
            else if (what == 80 || what == 81) instr = 10.95;
            else if (what == 86 || what == 87) instr = 10.96;
            prog = 317 + this.pgm;
        }

        if (howLong <= 0) this.on[what] = 1;
        if (howLoud <= 0) {
            instr *= -1;
            this.on[what] = 0;
        }

        return (
            "i" +
                instr +
                " " +
                secs(when) +
                " " +
                (howLong > 0 ? secs(howLong) : -1) +
                " " +
                what +
                " " +
                127 * howLoud +
                " " +
                prog +
                " " +
                this.chn +
                "\n"
        );
    }

    event(what, howLoud = this.howLoud, when = 0, howLong = this.howLong) {
        return [what, howLoud, when, howLong, this];
    }


    play(...evtLst) {
        const instr = this.instr;
        let amp = this.howLoud,
            dur = 0,
            when = 0, what, mess = "";
        if (evtLst.length == 0) {
            mess += this.score(this.what_,this.howLoud,0,0);
        } else {
            for (const evt of evtLst) {
                if (typeof evt === "object" && typeof evt !== "function") {
                    let what_ = evt[0];
                    let dur_ = evt.length > 3 ? evt[3] : 1;
                    let when_ = evt.length > 2 ? evt[2] : 0;
                    let amp_ = evt.length > 1 ? evt[1] : amp;
                    if(typeof what_ === "function") what = what_();
                    else what = what_;
                    if(typeof dur_ === "function") dur = dur_();
                    else dur = dur_;
                    if(typeof when_ === "function") when = when_();
                    else when = when_;
                    if(typeof amp_ === "function") amp = amp_();
                    else amp = amp_;
                } else {
                    let what_ = evt;
                    if(typeof what_ === "function") what = what_();
                    else what = what_;
                }
                mess += this.score(what, amp, when, dur);
            }
        }
        csound.inputMessage(mess);
    }

    stop(...evtLst) {
        let mess = "";
        if (evtLst.length == 0) {
            for (let what = 0; what < 128; what++) {
                if (this.on[what]) {
                    mess += this.score(what, 0, 0, 0);
                }
            }
        } else {
            for (const evt of evtLst) {
                let what, when = 0
                if(evt === 'object'){
                    what = evt[0];
                    when = evt.length > 2 ? evt[2] : 0;
                } else what = evt;
                mess += this.score(what, 0, when, 0);
            }
        }
        csound.inputMessage(mess);
    }

    bend(amount) {
        const val = 2 ** (amount/12);
        csound.tableSet(14,this.chn, val);
    }  

    reverb(amount) {
        csound.tableSet(8, this.chn, amount);
    }

    cutoff(amount) {
        csound.tableSet(17, this.chn, amount < 1 ?
                        (amount > 0 ? amount : 0) : 1);
    }

    resonance(amount) {
        csound.tableSet(18, this.chn, amount < 1 ?
                        (amount > 0 ? amount : 0): 1);
    }

    pan(amount) {
        csound.tableSet(3, this.chn, (amount < 1 ?
                                      (amount > 0 ? amount : 0)
                                      : 1)*127);
    }

    volume(amount) {
        csound.tableSet(2, this.chn, (amount < 1 ?
                                      (amount > 0 ? amount : 0)
                                      : 1)*127);
    }

    filterEnvelope(amount, att, dec, sus, rel) {
        csound.tableSet(19, this.chn, att);
        csound.tableSet(20, this.chn, dec);
        csound.tableSet(21, this.chn, sus);
        csound.tableSet(22, this.chn, rel);
        csound.tableSet(27, this.chn, amount);  
    }

    ampEnvelope(att, dec, sus, rel) {
        csound.tableSet(23, this.chn, att);
        csound.tableSet(24, this.chn, dec);
        csound.tableSet(25, this.chn, sus);
        csound.tableSet(26, this.chn, rel); 
    }

}

export const sample = {
    number: 0,
    fo: 60,
    bpm: 60,
    instr: null,
    load: function(what, fo = 60, bpm = 0){
        this.fo = fo;
        this.bpm = bpm;
        copyUrlToLocal(what, "localfile").then(() => {
            csound.inputMessage('i2 0 0' + ' "localfile" ' + this.fo + ' ' + this.number);
            if(bpm >  0) csound.tableSet(15, this.number, getBpm()/bpm);  
        })
    },
    loop: function(start, end) {
        csound.tableSet(11, this.number, start);
        csound.tableSet(12, this.number, end);
    },
    create: function (what = null, fo = 60, bpm = 0) {
        let e = Object.create(sample);
        e.number = globalObj.sampnum++;
        if(what) e.load(what, fo, bpm);
        e.instr = new Sampler(e);
        return e;
    },
    play: function (...evtList){
        this.instr.play(...evtList);
    },
    instrument: function (what = null, fo = 60, bpm = 0) {
        if(this.instr == null)
            return this.create(what, fo, bpm).instr;
        else return this.instr;
    }
    
}

export class Sampler extends Instrument {
    constructor(pgm, isDrums = false, what = pgm.fo) {
        super(pgm.number, isDrums, what, 12);
        this.sample = pgm;
    }
    play(...evtLst) {
        if(this.sample.bpm >  0) 
            csound.tableSet(15, this.number, getBpm()/this.sample.bpm); 
        super.play(...evtLst);
    }
    speed(val) {
        csound.tableSet(16, this.chn, val);
    }
}

function isInstr(instr) {
    return (instr instanceof Instrument);
}

// return seconds from beats
export function secs(b) {
    return (b * 60.0) / globalObj.BPM;
}

// return beats from seconds
export function beats(s) {
    return (s * globalObj.BPM) / 60.0;
}

// set beats per minute
export function setBpm(bpm) {
    globalObj.BPM = bpm;
}

// returns beats per minute
export function getBpm() {
    return globalObj.BPM; 
}

// current audio clock time
export function audioClock() {
    if (audio_context) return audio_context.currentTime;
    else return 0;
}

// sequencer object
export const sequencer = {
    clickOn: false,
    seqList: [],
    idcnt: 0,
    time: 0.0,
    callbacks: [],
    addCallback: function(x) { this.callbacks.push(x) },
    clearCallbacks: function() { this.callbacks = [] },
    click: function (ref) {
        if (!this.clickOn) return;
        let t = secs(1);
        let delta = audioClock() - (t + ref);
        if (delta >= 0) {
            this.time = t + audioClock() - delta;
            this.seqList.forEach((v, i, a) => {
                v.play(beats(t - delta));
            });
            const cbs = [...this.callbacks];
            this.callbacks = [];
            cbs.forEach((v,i,a) => {
                v(beats(t - delta));
            });
            setTimeout(this.click.bind(this, audioClock() - delta));
        } else setTimeout(this.click.bind(this, ref));
    },
    sequence: function (i, w, a, b, j) {
        return {
            id: j,
            instr: i,
            what: w,
            amp: a,
            bbs: b,
            n: 0,
            on: true,
            play: function (sched) {
                const what = this.what,
                      bbs = this.bbs;
                let pp, amp, theInstr = this.instr,
                    dur = theInstr.isDrums ? 0 : this.bbs;
                for (let i = 0; i < 1 / bbs; i++) {
                    let evt = what[this.n];
		    amp = this.amp;
                    this.n = this.n != what.length - 1 ? this.n + 1 : 0;
                    if (typeof evt !== "object") {
                        if(typeof evt === "function")
                            pp = evt();
                        else pp = evt;
                        if (sched >= 0 && pp >= 0 && this.on)
                            theInstr.play([pp, amp, sched + i * bbs, dur]);
                    } else {
                        if (typeof evt[0] !== "object") {
                            let what_ = evt[0];
                            if(typeof what_  === "function")
                                pp = what_();
                            else pp = what_;
                            if (evt.length > 1) {
                                let gain = evt[1];
                                if(typeof gain === "function")
                                    amp *= gain();
                                else amp *= gain;
                            }
                            if (evt.length > 2) {
                                let offs = evt[2];
                                if(typeof offs === "function")
                                    sched += offs();
                                else sched += offs;
                            }
                            if (evt.length > 3) {
                                let dur_ = evt[3];
                                if(typeof dur_ === "function")
                                    dur = dur_();
                                else dur = dur_;
                            }
                            if (evt.length > 4) {
                                let instr_ = evt[4];
                               if (typeof instr_ === "function")
                                  theInstr = instr_();
                               else
                                  theInstr = instr_;  
                               theInstr = isInstr(theInstr) ? theInstr : this.instr;
                               dur = dur > 0 ? dur : theInstr.isDrums ? 0 : t;
                            }
                            if (sched >= 0 && pp >= 0 && this.on)
                                theInstr.play([pp, amp, sched + i * bbs, dur]);
                        } else {
                            for (const el of evt) {
                                amp = this.amp;
                                theInstr = this.instr;
                                dur = theInstr.isDrums ? 0 : this.bbs;
                                let what_ = el[0];
                                
                                if(typeof what_  === "function")
                                    pp = what_();
                                else pp = what_;
                                
                                if (el.length > 1) {
                                    let gain = el[1];
                                    if(typeof gain === "function")
                                        amp *= gain();
                                    else amp *= gain;                                    
                                }
                                
                                if (el.length > 2) {
                                    let offs = el[2];
                                    if(typeof offs === "function")
                                        sched += offs();
                                    else sched += offs;
                                }
                                
                                if (el.length > 3) {
                                    let dur_ = el[3];
                                    if(typeof dur_ === "function")
                                        dur = dur_();
                                    else dur = dur_;
                                }
                                
                                if (el.length > 4) {
                                    let instr_ = el[4];
                                    if (typeof instr_ === "function")
                                        theInstr = instr_();
                                    else
                                        theInstr = instr_;  
                                    theInstr = isInstr(theInstr) ? theInstr : this.instr;
                                    dur = dur > 0 ? dur : theInstr.isDrums ? 0 : t;
                                }
                                                           
                                if (sched >= 0 && pp >= 0 && this.on)
                                    theInstr.play([pp, amp, sched + i * bbs, dur]);                     
                            }
                        }
                    }
                }
            },
        };
    },
    add: function (instr, what, howLoud = 1, bbs = 1) {
        if(isInstr(instr)) {
            let id = this.idcnt++;
            if (bbs > 1) bbs = 1;
            this.seqList.push(this.sequence(instr, what, howLoud, bbs, id));
            return id;
        } else return -1;
    },
    play: function () {
        if(!this.clickOn) {
            this.clickOn = true;
            this.click(audioClock());
        }
    },
    stop: function () {
        this.clickOn = false;
        this.seqList.forEach( (v,i,a) => { v.n = 0 });
    },
    clear: function () {
        this.seqList = [];
    },
    togglePause: function () {
        this.clickOn =! this.clickOn;
        this.click(audioClock());
    },
    toggleMute: function (id = -1) {
        this.seqList.forEach((v, i, a) => {
            if(id < 0 || v.id == id)  
                v.on = !v.on;
        });
    },
    toggleSolo: function (id) {
        this.seqList.forEach((v, i, a) => {
            if (v.id != id) v.on = !v.on;
        });
    },
    clock: function () {
        return this.time;
    },
    isRunning: function () {
        return this.clickOn;
    },
    remove: function(id) {
        this.seqList.forEach((v, i, a) => {
            if (v.id == id) this.seqList.splice(i,1);
        });   
    }
};

// eventList object
export const eventList = {
    events: [],
    play: function (when = 0, evtLst = this.events) {
        this.score(when, evtLst).play();
        this.events = evtLst;
        return this.maxdur + when;
    },
    create: function (...evtLst) {
        let e = Object.create(eventList);
        e.events = evtLst;
        return e;
    },
    score: function (when = 0, evtLst = this.events) {
        let mess = "";
        let instr, amp, dur, etime = 0,
            time = when, what;
        this.maxdur = 0.;
        for (const evt of evtLst) {
            if (typeof evt === "object" && typeof evt !== "function") {
                let what_ = evt[0];
                if (typeof what_ === "function")
                    what = what_();
                else
                    what = what_;
                let instr_ = evt.length > 4 ? evt[4] : defInstr;
                if (typeof instr_ === "function")
                    instr = instr_();
                else
                    instr = instr_;  
                instr = isInstr(instr) ? instr : defInstr;
                
                let dur_ = evt.length > 3 ? evt[3] : instr.howLong;
                if(typeof dur_ === "function")
                    dur = dur_();
                else dur = dur_;
                
                let time_ = evt.length > 2 ? evt[2] : 0;
                if(typeof time_ === "function") 
                    etime = time_()
                else etime = time_;
                
                time = etime + when;
                let amp_ = evt.length > 1 ? evt[1] : instr.howLoud;
                if(typeof amp_ === "function")
                    amp = amp_();
                else amp = amp_;     
            } else {
                if (typeof evt === "function")
                    what = evt_();
                else
                    what = evt;
                instr = defInstr;
                amp = instr.howLoud;
                dur = instr.howLong;
                instr = defInstr;
                etime = time;    
            }
            let totdur = etime + dur;
            if(what >= 0)
                mess += instr.score(what, amp, time, dur);
            if(totdur > this.maxdur) this.maxdur = totdur;
            time += dur;
        }
        return {
            score: mess,
            play: function () {
                csound.inputMessage(this.score);
            },
        };
    },
    repeat: function(times=1, when=0) {
        let next = when;
        for(let i = 0; i < times; i++)
            next = this.play(next);
        return next;
    },
    add: function(...evtLst) {
        for (const evt of evtLst)  
            this.events.push(evt);
    },
    clear: function() { this.events = []; },
    remove: function(ndx = -1) {
        if(ndx < 0 ) this.events.pop();
        else this.events.splice(ndx,1);
    },
    insert: function(pos, ...evtLst) {
        let start = pos;
        for (const evt of evtLst)  
            this.events.splice(pos, 0, evt);
    } 
};

// generic play
export function play(...theList) {
    if(typeof theList[0] === 'function')
        return play(theList[0]());
    if(isInstr(theList[0])){
        theList[0].play();
        return theList[0];
    }
    if(theList.length > 0) {
	eventList.create().play(0, theList);
        return theList;
    }
    else {
        defInstr.play();
        return defInstr;
    }
}

// set default instrument
export function instrument(instr) {
    if(typeof instr[0] === 'function')
        return instrument(instr[0]());
    if(isInstr(instr)) defInstr = instr;
    return defInstr;
}

export function stop() {
    defInstr.stop();
}


export const rnd = (min, max) => { return min + (max-min)*random(); };

const lowmin = 0.01;
const lowmax = 0.1;
const midmin = 0.1;
const midmax = 0.4;
const himin = 0.4;
const himax = 0.9;
export const softLevel = () => { return rnd(lowmin,lowmax); };
export const midLevel = () => { return rnd(midmin, midmax); };
export const loudLevel = () => { return rnd(himin, himax); };
export const soft = softLevel;
export const midlevel = midLevel;
export const loud = loudLevel;


const shortmin = 0.05;
const shortmax = 0.2;
const middurmin = 0.2;
const middurmax = 2;
const longmin = 2;
const longmax = 5;
export const shortDuration = () => { return rnd(shortmin,shortmax); };
export const midDuration = () => { return rnd(middurmin, middurmax); };
export const longDuration = () => { return rnd(longmin, longmax); };
export const shortdur = shortDuration;
export const middur = midDuration;
export const longdir = longDuration;

const immediatemin = 0.01;
const immediatemax = 0.5;
const soonmin = 0.5;
const soonmax = 4;
const latermin = 4;
const latermax = 8;

export const now = () => { return rnd(immediatemin,immediatemax); };
export const soon = () => { return rnd(soonmin, soonmax); };
export const later = () => { return rnd(latermin, latermax); };


const lowpmin = 12.0;
const lowpmax = 48.0;
const midpmin = 48.0;
const midpmax = 72.0;
const hipmin = 72.0;
const hipmax = 96.0;

export function lowPitch() { return rnd(lowpmin,lowpmax); }
export function midPitch()  { return rnd(midpmin, midpmax); }
export function hiPitch()  { return rnd(hipmin, hipmax); }
export const lowpitch = lowPitch;
export const midpitch = midPitch;
export const hipitch = hiPitch;

export function onSomething() { return new Instrument(int(rnd(0, 127))); }


// instrument collection
export const grandPiano = new Instrument(0);
export const  piano = grandPiano;
let defInstr = piano;
export const  brightPiano = new Instrument(1);
export const  electricGrand = new Instrument(2);
export const  honkyPiano = new Instrument(3);
export const  electricPiano = new Instrument(4);
export const  electricPiano2 = new Instrument(5);
export const  harpsichord = new Instrument(6);
export const  clavinet = new Instrument(7);

export const  celesta = new Instrument(8);
export const  glockenspiel = new Instrument(9);
export const musicBox = new Instrument(10);
export const vibraphone = new Instrument(11);
export const marimba = new Instrument(12);
export const xylophone = new Instrument(13);
export const tubularBells = new Instrument(14);
export const dulcimer = new Instrument(15);
export const  tinkleBell = new Instrument(112);

export function onStruck() {
    let num = int(rnd(0,16));
    if(num > 15) num = 112;
    return new Instrument(num);
}

export const drawbarOrgan = new Instrument(16);
export const percussiveOrgan = new Instrument(17);
export const rockOrgan = new Instrument(18);
export const organ = rockOrgan;
export const churchOrgan = new Instrument(19);
export const reedOrgan = new Instrument(20);
export const accordion = new Instrument(21);
export const harmonic = new Instrument(22);
export const tangoAccordion = new Instrument(23);

export function onSus() { return new Instrument(int(rnd(16,23))); }

export const nylonAcousticGuitar = new Instrument(24);
export const guitar = nylonAcousticGuitar;
export const steelAcousticGuitar = new Instrument(25);
export const jazzElectricGuitar = new Instrument(26);
export const clearElectricGuitar = new Instrument(27);
export const mutedElectricGuitar = new Instrument(28);
export const overdrivenGuitar = new Instrument(29);
export const  distortionGuitar = new Instrument(30);
export const  guitarHarmonics = new Instrument(31);
export const  sitar = new Instrument(105);
export const  banjo = new Instrument(106);
export const  shamisen = new Instrument(107);
export const  koto = new Instrument(108);
export const  kalimba = new Instrument(109);
export const  pizzicatoStrings = new Instrument(45);
export const  orchestralHarp = new Instrument(46);
export const  harp = orchestralHarp;

export function onPluck() {
    let num = int(rnd(24,38));
    if(num > 31 && num < 34) num += 13;
    if(num > 33) num += 71;
    return new Instrument(num);
}

export const  acousticBass = new Instrument(32);
export const  fingerElectricBass = new Instrument(33);
export const  pickElectricBass = new Instrument(34);
export const  fretlessBass = new Instrument(35);
export const  bass = fretlessBass;
export const  slapBass1 = new Instrument(36);
export const  slapBass2 = new Instrument(37);
export const  synthBass1 = new Instrument(38);
export const  synthBass2 = new Instrument(39);

export function onBass() { return new Instrument(int(rnd(32,39))); }

export const  violin = new Instrument(40);
export const  viola = new Instrument(41);
export const  cello = new Instrument(42);
export const  contrabass = new Instrument(43);
export const  tremoloStrings = new Instrument(44);
export const  fiddle = new Instrument(111);

export function onBowed() {
    let num = int(rnd(40,45));
    if(num > 44) num = 111;
    return new Instrument(num);
}

export const  stringEnsemble1 = new Instrument(48);
export const  strings = stringEnsemble1;
export const  stringEnsemble2 = new Instrument(49);
export const  synthStrings1 = new Instrument(50);
export const  synthStrings2 = new Instrument(51);

export function onEnsemble() { return new Instrument(int(rnd(48,51))); }

export const  choirAahs = new Instrument(52);
export const  voiceOohs = new Instrument(53);
export const  synthVoice = new Instrument(54);

export function onVoice() { return new Instrument(int(rnd(52,54))); }

export const  orchestralHit = new Instrument(55);

export const  trumpet = new Instrument(56);
export const  trombone = new Instrument(57);
export const  tuba = new Instrument(58);
export const  mutedTrumpet = new Instrument(59);
export const  frenchHorn = new Instrument(60);
export const  horn = frenchHorn;
export const  brassSection = new Instrument(61);
export const  brass = brassSection;
export const  synthBrass1 = new Instrument(62);
export const  synthBrass2 = new Instrument(63);

export function onBlow() { return new Instrument(int(rnd(56,63))); }

export const  sopranoSax = new Instrument(64);
export const  altoSax = new Instrument(65);
export const  tenorSax = new Instrument(66);
export const  baritoneSax = new Instrument(67);
export const  oboe = new Instrument(68);
export const  englishHorn = new Instrument(69);
export const  bassoon = new Instrument(70);
export const  clarinet = new Instrument(71);
export const  piccolo = new Instrument(72);
export const  flute = new Instrument(73);
export const  recorder = new Instrument(74);
export const  panFlute = new Instrument(75);
export const  blownBottle = new Instrument(76);
export const  shakuhachi = new Instrument(77);
export const  whistle = new Instrument(78);
export const  ocarina = new Instrument(79);
export const  bagPipe = new Instrument(110);

export function onWind() {
    let num = int(rnd(64,79));
    if(num > 79) num = 110;
    return new Instrument(num);
}

export const  lead1 = new Instrument(80);
export const  lead2 = new Instrument(81);
export const  lead3 = new Instrument(82);
export const  lead4 = new Instrument(83);
export const  lead5 = new Instrument(84);
export const  lead6 = new Instrument(85);
export const  lead7 = new Instrument(86);
export const  lead8 = new Instrument(87);

export function onLead() { return new Instrument(int(rnd(80,87))); }

export const  pad1 = new Instrument(88);
export const  pad2 = new Instrument(89);
export const  pad3 = new Instrument(90);
export const  pad4 = new Instrument(91);
export const  pad5 = new Instrument(92);
export const  synth = pad5;
export const  pad6 = new Instrument(93);
export const  pad7 = new Instrument(94);
export const  pad8 = new Instrument(96);

export function onSynth() { return new Instrument(int(rnd(88,96))); }

export const  fx1 = new Instrument(97);
export const  fx2 = new Instrument(98);
export const  fx3 = new Instrument(99);
export const  fx4 = new Instrument(100);
export const  fx5 = new Instrument(101);
export const  fx6 = new Instrument(102);
export const  fx7 = new Instrument(103);
export const  fx8 = new Instrument(104);

export function onFx() { return new Instrument(int(rnd(97,104))); }

export const  agogo = new Instrument(113);
export const  steelDrums = new Instrument(114);
export const  woodblock = new Instrument(115);
export const  taikoDrum = new Instrument(116);
export const  melodicTom = new Instrument(117);
export const  synthDrum = new Instrument(118);
export const  reverseCymbal = new Instrument(119);
export const  guitarFretNoise = new Instrument(120);
export const  breathNoise = new Instrument(121);
export const  seaShore = new Instrument(122);
export const  birdTweet = new Instrument(123);
export const  telephoneRing = new Instrument(124);
export const  helicopter = new Instrument(125);
export const  applause = new Instrument(126);
export const  gunshot = new Instrument(127);
export const  timpani = new Instrument(47);

export function onPerc() {
    let num = int(rnd(113,128));
    if(num > 127) num = 47;
    return new Instrument(num);
}

export const  drums1 = new Instrument(2, true, 40);
export const  drums = drums1;
export const  drums2 = new Instrument(3, true, 40);
export const  drums3 = new Instrument(4, true, 40);
export const  drums4 = new Instrument(5, true, 40);
export const  drums5 = new Instrument(6, true, 40);
export const  drums6 = new Instrument(7, true, 40);

export function onDrums() {
    return new Instrument(int(rnd(2,7)), true, int(rnd(35,57)));
}

export const silently = ms => new Promise(r => setTimeout(r, ms));

// Interface simples em Português

// funções
export const toque = play;
export const instrumento = instrument;
export const naBateria = onDrums;
export const nasTeclas = onStruck;
export const nasCordas = onPluck;
export const nosArcos = onBowed;
export const nosBaixos = onBass;
export const nosMetais = onBlow;
export const nosSopros = onWind;
export const noSint = onSynth;
export const cosEfeitos = onFx;
export const naPercussão = onPerc;
export const coaVoz = onVoice;
export const quieto = silently;

// instrumentos
class Instrumento extends Instrument {
    constructor(pgm, isDrums = false, what = 60, insno = 10) {
        super(pgm.number, isDrums, what, insno);
    }   
    toque(...evtList){
        super.play(...evtList);
    }
}

export const  pianoDeCauda = grandPiano;
export const  pianoBrilhante = brightPiano;
export const  deCaudaElétrico = electricGrand;
export const  pianoRachado = honkyPiano; //honky?
export const  pianoElétrico = electricPiano;
export const  pianoElétrico2 = electricPiano2;
export const  cravo = harpsichord;
export const  clavinete = clavinet;
export const  cravoElétrico = clavinet;

export const  caixaDeMúsica = musicBox;
export const  vibrafone = vibraphone;
export const  xilofone = xylophone;
export const  carrilhão = tubularBells; //sinos tubulares?
export const  sininho = tinkleBell;
export const  sino = tinkleBell;

export const órgãoElétrico = drawbarOrgan; //hammond?
export const órgãoPercussivo = percussiveOrgan;
export const órgãoDeRock = rockOrgan;
export const órgão = rockOrgan;
export const órgãoLitúrgico = churchOrgan;
export const órgãoDePalhetas = reedOrgan;
export const acordeão = accordion;
export const gaita = harmonic;
export const acordeãoDeTango = tangoAccordion;

export const  violão = nylonAcousticGuitar;
export const  vilãoDeNáilon = nylonAcousticGuitar;
export const  violãoDeAço = steelAcousticGuitar;
export const  guitarraDeJazz = jazzElectricGuitar;
export const  guitarraLimpa = clearElectricGuitar;
export const  guitarraAbafada = mutedElectricGuitar;
export const  guitarraOverdrive = overdrivenGuitar;
export const  guitarraDistorcida = distortionGuitar;
export const  guitarraHarmônicos = guitarHarmonics;
export const  samisém = shamisen;
export const  cordasPizzicato = pizzicatoStrings;
export const  harpaOrquestral = orchestralHarp;
export const  harpa = orchestralHarp;

export const  baixoAcústico = acousticBass;
export const  baixoElétrico = fingerElectricBass;
export const  baixoElétricoPalhetado = pickElectricBass;
export const  baixoFretless = fretlessBass;
export const  baixo = fretlessBass;
export const  baixoSlap1 = slapBass1;
export const  baixoSlap2 = slapBass2;
export const  baixoSintetizado1 = synthBass1;
export const  baixoSintetizado2 = synthBass2;

export const  violino = violin;
export const  violoncelo = cello;
export const  celo = violoncelo;
export const  contrabaixo = contrabass;
export const  cordasTremolo = tremoloStrings;

export const  cordas = stringEnsemble1;
export const  cordas2 = stringEnsemble2;
export const  cordasSintetizadas1 = synthStrings1;
export const  cordasSintetizadas2 = synthStrings2;

export const  coralAahs = choirAahs;
export const  coralOohs = voiceOohs;
export const  vozSintetizada = synthVoice;

export const  golpeOrquestral = orchestralHit;
export const  golpe = orchestralHit;

export const  trompete = trumpet;
export const  trompeteAbafado = mutedTrumpet;
export const  trompeteComSurdina = mutedTrumpet;
export const  trompaFrancesa = frenchHorn;
export const  trompa = trompaFrancesa;
export const  seçãoDeMetais = brassSection;
export const  metais = seçãoDeMetais;
export const  metalSintetizado1 = synthBrass1;
export const  metalSintetizado2 = synthBrass2;

export const  saxSoprando = sopranoSax;
export const  saxAlto = altoSax;
export const  saxTenor = tenorSax;
export const  saxBarítono = baritoneSax;
export const  oboé = oboe;
export const  corneInglês = englishHorn;
export const  fagote = bassoon;
export const  clarineta = clarinet;
export const  clarinete = clarinet;
export const  pícolo = piccolo;
export const  flautaTransversal = flute;
export const  flauta = flute;
export const  flautaDoce = recorder;
export const  flautaDePã = panFlute;
export const  garrafaSoprada = blownBottle;
export const  garrafa = garrafaSoprada;
export const  assobio = whistle;
export const  assovio = assobio;
export const  gaitaDeFole = bagPipe;

export const  efeito1 = fx1;
export const  efeito2 = fx2;
export const  efeito3 = fx3;
export const  efeito4 = fx4;
export const  efeito5 = fx5;
export const  efeito6 = fx6;
export const  efeito7 = fx6;
export const  efeito8 = fx8;

export const  agogô = agogo;
export const  tamborDeAço = steelDrums;
export const  blocoDeMadeira = woodblock;
export const  bloco = blocoDeMadeira;
export const  taiko = taikoDrum;
export const  tomTom = melodicTom;
export const  bateriaSintetizada = synthDrum;
export const  pratoReverso = reverseCymbal;
export const  trasteDeGuitarra = guitarFretNoise;
export const  traste = trasteDeGuitarra;
export const  respiração = breathNoise;
export const  ondaDoMar = seaShore;
export const  pássaro = birdTweet;
export const  telefone = telephoneRing;
export const  helicóptero = helicopter;
export const  aplausos = applause;
export const  tiro = gunshot;
export const  tímpano = timpani;

export const  bateria1 = drums1;
export const  bateria = drums1;
export const  bateria2 = drums2;
export const  bateria3 = drums3;
export const  bateria4 = drums4;
export const  bateria5 = drums5;
export const  bateria6 = drums6;
