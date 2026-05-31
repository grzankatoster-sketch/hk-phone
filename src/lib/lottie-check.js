// Lottie animation: plum checkmark — 90 frames @ 60fps (~1.5s)
export const checkPlumAnim = {
  v: "5.7.4", fr: 60, ip: 0, op: 90, w: 200, h: 200,
  nm: "check-plum", ddd: 0, assets: [],
  layers: [
    {
      ddd: 0, ind: 2, ty: 4, nm: "check", sr: 1,
      ks: {
        o: { a: 0, k: 100 }, r: { a: 0, k: 0 },
        p: { a: 0, k: [100, 100, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] }
      },
      ao: 0,
      shapes: [
        {
          ty: "sh", nm: "Path",
          ks: {
            a: 0,
            k: {
              i: [[0,0],[0,0],[0,0]],
              o: [[0,0],[0,0],[0,0]],
              v: [[-36, 4], [-10, 32], [42, -30]],
              c: false
            }
          }
        },
        {
          ty: "tm", nm: "Trim",
          s: { a: 0, k: 0 },
          e: {
            a: 1,
            k: [
              { t: 24, s: [0], h: 0, i: { x: [0.2], y: [1] }, o: { x: [0.8], y: [0] } },
              { t: 62, s: [100] }
            ]
          },
          o: { a: 0, k: 0 }, m: 1
        },
        {
          ty: "st", nm: "Stroke",
          c: { a: 0, k: [1, 1, 1, 1] },
          o: { a: 0, k: 100 },
          w: { a: 0, k: 14 },
          lc: 2, lj: 2
        }
      ],
      ip: 0, op: 90, st: 0
    },
    {
      ddd: 0, ind: 1, ty: 4, nm: "circle", sr: 1,
      ks: {
        o: { a: 0, k: 100 }, r: { a: 0, k: 0 },
        p: { a: 0, k: [100, 100, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: {
          a: 1,
          k: [
            { t: 0,  s: [0,   0,   100], h: 0, i: { x: [0.2], y: [1] }, o: { x: [0.8], y: [0] } },
            { t: 22, s: [114, 114, 100], h: 0, i: { x: [0.5], y: [1] }, o: { x: [0.5], y: [0] } },
            { t: 32, s: [100, 100, 100] }
          ]
        }
      },
      ao: 0,
      shapes: [
        {
          ty: "el", nm: "Ellipse", d: 1,
          s: { a: 0, k: [154, 154] },
          p: { a: 0, k: [0, 0] }
        },
        {
          ty: "fl", nm: "Fill",
          c: { a: 0, k: [0.353, 0.114, 0.290, 1] },
          o: { a: 0, k: 100 }, r: 1
        }
      ],
      ip: 0, op: 90, st: 0
    }
  ]
};
