// 실드/아머 데미지 파이프라인 — 순수 로직 (vitest 대상). 데모 damagePlayer() 수치부 이식.
export interface HullState {
  shield: number;
  armor: number;
}

/** 실드 우선 소모, 초과분은 아머로. 반환: 새 상태와 사망 여부. */
export function applyDamage(hull: HullState, d: number): HullState & { dead: boolean } {
  let { shield, armor } = hull;
  if (shield > 0) {
    shield -= d;
    if (shield < 0) {
      armor += shield;
      shield = 0;
    }
  } else {
    armor -= d;
  }
  const dead = armor <= 0;
  return { shield, armor: Math.max(0, armor), dead };
}

/** AABB 판정 (중심좌표+크기) — 데모 aabb() 동일. */
export function aabb(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return Math.abs(ax - bx) * 2 < aw + bw && Math.abs(ay - by) * 2 < ah + bh;
}
