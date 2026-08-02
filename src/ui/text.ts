// 데모의 text() 헬퍼 대응 — 굵은 모노스페이스 + 1px 그림자.
import Phaser from 'phaser';

export function uiText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  s: string,
  size: number,
  color: string,
  align: 'left' | 'center' | 'right' = 'left',
): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, s, {
    fontFamily: '"Courier New", monospace',
    fontStyle: 'bold',
    fontSize: `${size}px`,
    color,
  });
  t.setShadow(1, 1, 'rgba(0,0,0,0.7)', 0);
  if (align === 'center') t.setOrigin(0.5, 0.5);
  else if (align === 'right') t.setOrigin(1, 0.5);
  else t.setOrigin(0, 0.5);
  return t;
}
