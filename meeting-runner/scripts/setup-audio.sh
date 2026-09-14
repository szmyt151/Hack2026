#!/usr/bin/env bash
# Tworzy dwa wirtualne urządzenia w PulseAudio:
#   meeting_out   – tu Chromium odtwarza dźwięk spotkania; nagrywamy z meeting_out.monitor
#   assistant_mic – tu piszemy głos asystenta; Chromium bierze assistant_mic.monitor jako mikrofon
set -e

if [[ "$(uname -s)" == "Darwin" ]]; then
  echo "macOS uses CoreAudio, so there is no local PulseAudio setup to run."
  echo "The meeting runner's audio pipeline is supported through its Linux Docker image:"
  echo "  docker build -t meeting-runner -f docker/Dockerfile ."
  echo "  docker run --env-file .env -e BROKER_URL=ws://host.docker.internal:8080 -v \"$(pwd)/.chromium-profile:/app/.chromium-profile\" meeting-runner"
  echo "Run 'npm run audio:setup' inside the container (the image does this automatically)."
  exit 0
fi

if ! command -v pulseaudio >/dev/null 2>&1 || ! command -v pactl >/dev/null 2>&1; then
  echo "PulseAudio and pactl are required on Linux. Install pulseaudio (including pactl), then rerun this command." >&2
  exit 1
fi

pulseaudio --check 2>/dev/null || pulseaudio --start --exit-idle-time=-1
pactl load-module module-null-sink sink_name="${PULSE_SINK_MEETING:-meeting_out}" sink_properties=device.description=meeting_out >/dev/null || true
pactl load-module module-null-sink sink_name="${PULSE_SINK_ASSISTANT:-assistant_mic}" sink_properties=device.description=assistant_mic >/dev/null || true
echo "Sinki:"; pactl list short sinks
echo "Źródła:"; pactl list short sources
