// トークン数の推定。Provider ごとの正確なトークナイザーは持たないため、
// 日本語（かな・漢字・全角記号）は1文字≒1トークン、それ以外は4文字≒1トークンで数える。
// 生成後は Provider が返す実測値（usage）を Snapshot に表示する。

function isWide(code: number): boolean {
  return (
    (code >= 0x3000 && code <= 0x30ff) || // 句読点・かな
    (code >= 0x3400 && code <= 0x4dbf) || // CJK 拡張A
    (code >= 0x4e00 && code <= 0x9fff) || // CJK 統合漢字
    (code >= 0xf900 && code <= 0xfaff) || // CJK 互換漢字
    (code >= 0xff00 && code <= 0xffef) // 全角英数・半角カナ
  );
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  let wide = 0;
  let narrow = 0;
  for (const ch of text) {
    if (isWide(ch.codePointAt(0) ?? 0)) wide++;
    else narrow++;
  }
  return Math.ceil(wide + narrow / 4);
}

/** 文字数（サロゲートペアを1文字として数える） */
export function countChars(text: string): number {
  let n = 0;
  for (const ch of text) if (ch !== '\n' && ch !== '\r') n++;
  return n;
}
