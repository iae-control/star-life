// 다층 패럴랙스 우주 배경 — levels.json의 배경 테마를 해석한다.
// 각 테마 = 성운/별/지형 타일 레이어 + 고정 장식(태양·충격파·소용돌이 등).
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH } from '../config';

export interface BackgroundConfig {
  theme:
    | 'nebula'
    | 'protostar'
    | 'mainseq'
    | 'asteroids'
    | 'redgiant'
    | 'supernova'
    | 'blackhole'
    | 'inside';
  nebulaAlpha: number;
}

export class SpaceBackground {
  private layers: { sprite: Phaser.GameObjects.TileSprite; speed: number; hueCycle?: boolean }[] =
    [];
  private decors: { img: Phaser.GameObjects.Image; rot: number; pulse: number }[] = [];
  private t = 0;

  constructor(
    scene: Phaser.Scene,
    baseDepth = 0,
    config: BackgroundConfig = { theme: 'nebula', nebulaAlpha: 0.85 },
  ) {
    const add = (
      key: string,
      depth: number,
      speed: number,
      alpha = 1,
      blend = false,
      hueCycle = false,
    ) => {
      const sprite = scene.add
        .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, key)
        .setOrigin(0, 0)
        .setDepth(depth)
        .setAlpha(alpha);
      if (blend) sprite.setBlendMode(Phaser.BlendModes.ADD);
      this.layers.push({ sprite, speed, hueCycle });
    };
    const decor = (
      key: string,
      x: number,
      y: number,
      depth: number,
      opts: { rot?: number; pulse?: number; alpha?: number; scale?: number } = {},
    ) => {
      const img = scene.add
        .image(x, y, key)
        .setDepth(depth)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(opts.alpha ?? 1)
        .setScale(opts.scale ?? 1);
      this.decors.push({ img, rot: opts.rot ?? 0, pulse: opts.pulse ?? 0 });
    };

    // 테마 색 정체성: 그라디언트 언더레이 + 별 색조
    const underlay = scene.add
      .image(0, 0, `bg-grad-${config.theme}`)
      .setOrigin(0, 0)
      .setDepth(baseDepth - 0.05);
    this.decors.push({ img: underlay, rot: 0, pulse: 0 });
    const cinematicTint: Partial<Record<BackgroundConfig['theme'], number>> = {
      protostar: 0xffb57a,
      mainseq: 0xffdd91,
      asteroids: 0xb9c2d0,
      redgiant: 0xff6b55,
      supernova: 0xe7a4ff,
      blackhole: 0x8c7be8,
      inside: 0x72d6bb,
    };
    const cinematic = scene.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg-cinematic-nebula')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
      .setDepth(baseDepth - 0.04)
      .setAlpha(config.theme === 'blackhole' ? 0.38 : 0.66);
    const backdropTint = cinematicTint[config.theme];
    if (backdropTint) cinematic.setTint(backdropTint);
    this.decors.push({ img: cinematic, rot: 0, pulse: 0 });
    const starTint: Record<string, number> = {
      protostar: 0xffd8b0,
      mainseq: 0xfff0c0,
      redgiant: 0xffb8a0,
      supernova: 0xf0d8ff,
      inside: 0xc8ffd8,
    };
    const tint = starTint[config.theme];

    const a = config.nebulaAlpha;
    switch (config.theme) {
      case 'protostar':
        add('bg-nebula-warm', baseDepth, 0.12, a, true);
        add('bg-stars-far', baseDepth + 0.1, 0.35);
        add('bg-debris', baseDepth + 0.2, 1.0, 0.85);
        break;
      case 'mainseq':
        add('bg-nebula-warm', baseDepth, 0.1, a * 0.8, true);
        add('bg-sunstreaks', baseDepth + 0.05, 0.4, 1, true);
        add('bg-stars-far', baseDepth + 0.1, 0.35);
        // 거대 태양 — 주계열성의 정체성 (피드백 5)
        decor('decor-sun', GAME_WIDTH - 70, 60, baseDepth + 0.15, { pulse: 0.1, scale: 1.15 });
        add('bg-stars-near', baseDepth + 0.2, 0.85, 0.8);
        break;
      case 'asteroids':
        add('bg-nebula', baseDepth, 0.12, a, true);
        add('bg-stars-far', baseDepth + 0.1, 0.35);
        add('bg-stars-near', baseDepth + 0.15, 0.6, 0.7);
        add('bg-asteroids', baseDepth + 0.2, 1.0);
        break;
      case 'redgiant':
        add('bg-nebula-red', baseDepth, 0.12, a, true);
        add('bg-stars-far', baseDepth + 0.1, 0.3, 0.7);
        decor('decor-redlimb', GAME_WIDTH / 2, GAME_HEIGHT - 90, baseDepth + 0.15, {
          pulse: 0.08,
        });
        add('bg-debris', baseDepth + 0.2, 1.0, 0.7);
        break;
      case 'supernova':
        add('bg-nebula-warm', baseDepth, 0.14, a, true);
        add('bg-sunstreaks', baseDepth + 0.05, 0.5, 1, true);
        decor('decor-shock', GAME_WIDTH / 2, 210, baseDepth + 0.08, { pulse: 0.25 });
        add('bg-stars-far', baseDepth + 0.1, 0.45);
        add('bg-stars-near', baseDepth + 0.2, 0.95, 0.9);
        break;
      case 'blackhole':
        add('bg-nebula', baseDepth, 0.08, a * 0.6, true);
        decor('decor-swirl', GAME_WIDTH / 2, 150, baseDepth + 0.06, { rot: 0.35, alpha: 0.8 });
        add('bg-stars-far', baseDepth + 0.1, 0.3, 0.6);
        break;
      case 'inside':
        // 블랙홀 안쪽 — 색이 순환하는 성운, 거꾸로 흐르는 별, 반대로 도는 왜곡 링
        add('bg-nebula-warm', baseDepth, 0.1, a, true, true);
        decor('decor-warpring', GAME_WIDTH / 2, 200, baseDepth + 0.05, { rot: 0.22, alpha: 0.9 });
        decor('decor-warpring', GAME_WIDTH / 2, 430, baseDepth + 0.06, {
          rot: -0.3,
          alpha: 0.6,
          scale: 1.5,
        });
        add('bg-stars-far', baseDepth + 0.1, -0.4, 0.8);
        add('bg-stars-near', baseDepth + 0.2, -0.7, 0.6);
        break;
      default:
        add('bg-nebula', baseDepth, 0.12, a, true);
        add('bg-stars-far', baseDepth + 0.1, 0.35);
        add('bg-stars-near', baseDepth + 0.2, 0.85);
    }
    this.applyStarTint(tint);
  }

  private applyStarTint(tint: number | undefined): void {
    if (!tint) return;
    for (const l of this.layers) {
      if (l.sprite.texture.key.startsWith('bg-stars')) l.sprite.setTint(tint);
    }
  }

  /** speed: 논리 스크롤 속도(px/s) — 레이어별 시차 배율 적용 */
  update(dt: number, speed: number): void {
    this.t += dt;
    for (const l of this.layers) {
      l.sprite.tilePositionY -= speed * l.speed * dt;
      if (l.hueCycle) {
        const hue = (this.t * 0.06) % 1;
        l.sprite.setTint(Phaser.Display.Color.HSVToRGB(hue, 0.75, 1).color);
      }
    }
    for (const d of this.decors) {
      if (d.rot) d.img.rotation += d.rot * dt;
      if (d.pulse) d.img.setAlpha((d.img.alpha = 0.85 + Math.sin(this.t * 1.4) * d.pulse));
    }
  }

  destroy(): void {
    for (const l of this.layers) l.sprite.destroy();
    for (const d of this.decors) d.img.destroy();
    this.layers = [];
    this.decors = [];
  }
}
