#!/usr/bin/env bash
# Test bez meeting-runnera: lokalny mikrofon -> broker[audio], broker[tts_audio] -> głośnik.
# Wymaga: mock-broker (z meeting-runner), voice-core z START_IMMEDIATELY=1, ffmpeg, node.
# Użycie: bash scripts/mic.sh
set -e
RATE=${AUDIO_SAMPLE_RATE:-16000}
BROKER=${BROKER_URL:-ws://localhost:8080}
node --input-type=module -e "
import WebSocket from 'ws';
import { spawn } from 'node:child_process';
const ws = new WebSocket('$BROKER');
const rec = spawn('ffmpeg', ['-loglevel','error','-f','pulse','-i','default','-ac','1','-ar','$RATE','-f','s16le','pipe:1']);
const play = spawn('ffmpeg', ['-loglevel','error','-f','s16le','-ar','$RATE','-ac','1','-i','pipe:0','-f','pulse','default']);
ws.on('open', () => rec.stdout.on('data', (c) => ws.send(JSON.stringify({channel:'audio',ts:Date.now(),sessionId:'mic',format:'pcm_s16le',sampleRate:$RATE,channels:1,data:c.toString('base64')}))));
ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.channel==='tts_audio') play.stdin.write(Buffer.from(m.data,'base64')); });
"
