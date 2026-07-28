# Circuit — an arcade racer

A drivable kart on a closed circuit. The track curve is the single source of truth: the
road ribbon, the on-track test, the lap checkpoints and the autopilot racing line all
derive from ONE Catmull-Rom loop, so moving a control point moves every system with it.

Live: https://kart-racer.hanzo.app

Arrows/WASD to drive, SPACE to brake. It runs its own autopilot until you touch a key, so
the demo is alive the moment it loads instead of showing a parked car.

Off-track grip drops to 0.42 and top speed with it — the whole handling model is two
numbers, which is what makes an arcade racer feel arcade.

## Build

```sh
npm install && npm run build
```

## Deploy to hanzo.app

Games ship through the release lane, not the artifact lane: the public edge caps a
request body at 4 MiB, so stage the built tree to your object space and let
`POST /v1/sites/:slug/publish` promote it server-side.

Fingerprint your asset names — the site server marks a content-hashed filename
`immutable`, and a redeploy that reuses a name serves the old bundle against the new
everything-else.

## License

MIT. three.js is MIT, (c) the three.js authors.
