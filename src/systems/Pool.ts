// 스프라이트/오브젝트 풀 — 탄·적탄·이펙트 전부 재사용 (PLAN 3장 ObjectPool).
import Phaser from 'phaser';

/** 텍스처 이미지 풀. release된 이미지를 재사용해 GC 스파이크를 방지한다. */
export class ImagePool {
  private free: Phaser.GameObjects.Image[] = [];

  constructor(
    private scene: Phaser.Scene,
    private defaultTexture: string,
    private depth: number,
    prealloc = 0,
  ) {
    for (let i = 0; i < prealloc; i++) this.free.push(this.make());
  }

  private make(): Phaser.GameObjects.Image {
    const img = this.scene.add.image(0, 0, this.defaultTexture);
    img.setDepth(this.depth);
    img.setVisible(false);
    img.setActive(false);
    return img;
  }

  get(texture: string, x: number, y: number): Phaser.GameObjects.Image {
    const img = this.free.pop() ?? this.make();
    img.setTexture(texture);
    img.setPosition(x, y);
    img.setVisible(true);
    img.setActive(true);
    img.setAlpha(1);
    img.setScale(1);
    img.setRotation(0);
    img.clearTint();
    img.setBlendMode(Phaser.BlendModes.NORMAL);
    return img;
  }

  release(img: Phaser.GameObjects.Image): void {
    img.setVisible(false);
    img.setActive(false);
    this.free.push(img);
  }

  destroy(): void {
    for (const img of this.free) img.destroy();
    this.free = [];
  }
}
