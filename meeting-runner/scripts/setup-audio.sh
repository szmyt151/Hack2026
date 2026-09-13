#!/usr/bin/env bash
# Tworzy dwa wirtualne urządzenia w PulseAudio:
#   meeting_out   – tu Chromium odtwarza dźwięk spotkania; nagrywamy z meeting_out.monitor
#   assistant_mic – tu piszemy głos asystenta; Chromium bierze assistant_mic.monitor jako mikrofon
set -e
pulseaudio --check 2>/dev/null || pulseaudio --start --exit-idle-time=-1
pactl load-module module-null-sink sink_name="${PULSE_SINK_MEETING:-meeting_out}" sink_properties=device.description=meeting_out >/dev/null || true
pactl load-module module-null-sink sink_name="${PULSE_SINK_ASSISTANT:-assistant_mic}" sink_properties=device.description=assistant_mic >/dev/null || true
echo "Sinki:"; pactl list short sinks
echo "Źródła:"; pactl list short sources
