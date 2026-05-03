'use strict';

// =====================
// 牌の定義
// =====================
const TILES = (() => {
  const tiles = [];
  // 数牌 (man, pin, sou) 1-9 各4枚
  for (const suit of ['man', 'pin', 'sou']) {
    for (let n = 1; n <= 9; n++) {
      for (let copy = 0; copy < 4; copy++) {
        tiles.push({ suit, num: n, copy, id: `${suit}${n}_${copy}` });
      }
    }
  }
  // 字牌 (honor): 東南西北白発中 各4枚
  const honors = ['東', '南', '西', '北', '白', '発', '中'];
  for (let i = 0; i < honors.length; i++) {
    for (let copy = 0; copy < 4; copy++) {
      tiles.push({ suit: 'honor', num: i + 1, honor: honors[i], copy, id: `honor${i+1}_${copy}` });
    }
  }
  return tiles;
})();

const HONOR_NAMES = ['東', '南', '西', '北', '白', '発', '中'];
const SUIT_LABELS = { man: '萬', pin: '筒', sou: '索' };

// 牌のHTML（数字＋スーツ2段表示）
function tileDisplay(tile) {
  if (!tile) return '';
  if (tile.suit === 'honor') {
    return `<span class="t-n">${tile.honor}</span>`;
  }
  return `<span class="t-n">${tile.num}</span><span class="t-s">${SUIT_LABELS[tile.suit]}</span>`;
}

// メッセージ用テキスト
function tileText(tile) {
  if (!tile) return '';
  if (tile.suit === 'honor') return tile.honor;
  return tile.num + SUIT_LABELS[tile.suit];
}

function tileHtml(tile) {
  if (!tile) return '';
  return `<span class="tile small ${tileClass(tile)}" style="display:inline-flex;vertical-align:middle;cursor:default;pointer-events:none">${tileDisplay(tile)}</span>`;
}

function tileClass(tile) {
  if (!tile) return '';
  if (tile.suit === 'honor') {
    if (tile.honor === '中') return 'honor chun';
    if (tile.honor === '発') return 'honor hatsu';
    if (tile.honor === '白') return 'honor haku';
    return 'honor wind';
  }
  return tile.suit;
}

function tilesEqual(a, b) {
  return a.suit === b.suit && a.num === b.num;
}

function tileKey(tile) {
  return tile.suit === 'honor' ? `h${tile.num}` : `${tile.suit[0]}${tile.num}`;
}

// =====================
// シャッフル
// =====================
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// =====================
// 和了判定
// =====================

function groupTiles(hand) {
  // 牌をソートしてグループ化
  const sorted = [...hand].sort(compareTile);
  return sorted;
}

function compareTile(a, b) {
  const suitOrder = { man: 0, pin: 1, sou: 2, honor: 3 };
  if (suitOrder[a.suit] !== suitOrder[b.suit]) return suitOrder[a.suit] - suitOrder[b.suit];
  return a.num - b.num;
}

// 完全手牌 (14枚) から和了形を探す
function isWinningHand(tiles) {
  if (tiles.length !== 14) return false;
  // 七対子チェック
  if (isChiitoitsu(tiles)) return true;
  // 国士無双チェック
  if (isKokushi(tiles)) return true;
  // 通常形チェック
  return checkNormal(tiles);
}

function isChiitoitsu(tiles) {
  const counts = countTiles(tiles);
  const pairs = Object.values(counts).filter(c => c >= 2);
  return pairs.length === 7 && tiles.length === 14;
}

function isKokushi(tiles) {
  const terminals = ['man1','man9','pin1','pin9','sou1','sou9','h1','h2','h3','h4','h5','h6','h7'];
  const keys = tiles.map(tileKey);
  const unique = new Set(keys);
  const hasAll = terminals.every(t => unique.has(t));
  if (!hasAll) return false;
  return terminals.some(t => keys.filter(k => k === t).length >= 2);
}

function countTiles(tiles) {
  const counts = {};
  for (const t of tiles) {
    const k = tileKey(t);
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}

function checkNormal(tiles) {
  const sorted = [...tiles].sort(compareTile);
  return tryExtract(sorted);
}

function tryExtract(tiles) {
  if (tiles.length === 0) return true;

  // 雀頭を探す
  for (let i = 0; i < tiles.length - 1; i++) {
    if (tilesEqual(tiles[i], tiles[i + 1])) {
      const rest = [...tiles];
      rest.splice(i, 1);
      rest.splice(i, 1);
      if (tryMeld(rest)) return true;
      // 同じ牌をスキップ
      while (i < tiles.length - 1 && tilesEqual(tiles[i], tiles[i + 1])) i++;
    }
  }
  return false;
}

function tryMeld(tiles) {
  if (tiles.length === 0) return true;

  const first = tiles[0];

  // 刻子チェック
  if (tiles.filter(t => tilesEqual(t, first)).length >= 3) {
    const rest = [...tiles];
    let removed = 0;
    for (let i = 0; i < rest.length && removed < 3; i++) {
      if (tilesEqual(rest[i], first)) {
        rest.splice(i, 1);
        i--;
        removed++;
      }
    }
    if (tryMeld(rest)) return true;
  }

  // 順子チェック (数牌のみ)
  if (first.suit !== 'honor' && first.num <= 7) {
    const n2 = tiles.find(t => t.suit === first.suit && t.num === first.num + 1);
    const n3 = tiles.find(t => t.suit === first.suit && t.num === first.num + 2);
    if (n2 && n3) {
      const rest = tiles.filter(t => t !== first && t !== n2 && t !== n3);
      // ポインタが同じオブジェクトでない場合を考慮して最初の一致を削除
      if (rest.length === tiles.length - 3) {
        if (tryMeld(rest)) return true;
      } else {
        // インデックスで削除
        const restIdx = [...tiles];
        const i1 = restIdx.indexOf(first);
        restIdx.splice(i1, 1);
        const i2 = restIdx.findIndex(t => t.suit === first.suit && t.num === first.num + 1);
        restIdx.splice(i2, 1);
        const i3 = restIdx.findIndex(t => t.suit === first.suit && t.num === first.num + 2);
        restIdx.splice(i3, 1);
        if (tryMeld(restIdx)) return true;
      }
    }
  }

  return false;
}

// テンパイ判定 (13枚)
function isTenpai(tiles) {
  if (tiles.length !== 13) return false;
  // 全牌種を試して和了できるか確認
  const candidates = getAllTileTypes();
  for (const cand of candidates) {
    if (isWinningHand([...tiles, cand])) return true;
  }
  return false;
}

// 待ち牌取得
function getWaitingTiles(tiles) {
  if (tiles.length !== 13) return [];
  const candidates = getAllTileTypes();
  const waiting = [];
  for (const cand of candidates) {
    if (isWinningHand([...tiles, cand])) {
      waiting.push(cand);
    }
  }
  return waiting;
}

function getAllTileTypes() {
  const types = [];
  for (const suit of ['man', 'pin', 'sou']) {
    for (let n = 1; n <= 9; n++) {
      types.push({ suit, num: n, copy: 0, id: `${suit}${n}_tmp` });
    }
  }
  for (let i = 0; i < HONOR_NAMES.length; i++) {
    types.push({ suit: 'honor', num: i + 1, honor: HONOR_NAMES[i], copy: 0, id: `honor${i+1}_tmp` });
  }
  return types;
}

// =====================
// 役判定
// =====================
function evaluateHand(hand, melds, drawnTile, isTsumo, isRiichi, roundWind, seatWind, dora, uraDora) {
  const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];
  const isMenzen = melds.every(m => m.type === 'ankan');

  const yaku = [];
  let han = 0;
  let fu = 30;

  if (isRiichi) { yaku.push('リーチ'); han += 1; }
  if (isTsumo && isMenzen) { yaku.push('門前清自摸和'); han += 1; }
  if (isMenzen && isWinningHand(allTiles)) {
    // タンヤオ
    if (isTanyao(allTiles)) { yaku.push('断么九'); han += 1; }
    // ピンフ
    if (isPinfu(hand, melds, roundWind, seatWind)) { yaku.push('平和'); han += 1; if (!isTsumo) fu = 30; else fu = 20; }
    // イーペーコ
    if (isIipeiko(hand)) { yaku.push('一盃口'); han += 1; }
    // リャンペーコ
    if (isRyanpeiko(hand)) { yaku.push('二盃口'); han += 3; }
  }
  // 鳴き有りでも成立
  if (isTanyao(allTiles) && !yaku.includes('断么九')) { yaku.push('断么九'); han += 1; }

  // 役牌
  const yakuhai = getYakuhai(allTiles, roundWind, seatWind);
  for (const y of yakuhai) { yaku.push(y); han += 1; }

  // 七対子
  if (isChiitoitsu(allTiles)) { yaku.push('七対子'); han += 2; fu = 25; }

  // 国士無双
  if (isKokushi(allTiles)) { yaku.push('国士無双'); han = 13; }

  // ドラ加算
  let doraCount = 0;
  for (const tile of allTiles) {
    for (const d of dora) {
      if (tilesEqual(tile, d)) doraCount++;
    }
  }
  if (doraCount > 0) { yaku.push(`ドラ${doraCount}`); han += doraCount; }

  // 裏ドラ (リーチ時)
  if (isRiichi && uraDora) {
    let uraCount = 0;
    for (const tile of allTiles) {
      for (const d of uraDora) {
        if (tilesEqual(tile, d)) uraCount++;
      }
    }
    if (uraCount > 0) { yaku.push(`裏ドラ${uraCount}`); han += uraCount; }
  }

  if (yaku.length === 0) return null; // 役なし

  // 点数計算
  const score = calcScore(han, fu, isTsumo, seatWind === 1);
  return { yaku, han, fu, score };
}

function isTanyao(tiles) {
  return tiles.every(t => {
    if (t.suit === 'honor') return false;
    return t.num >= 2 && t.num <= 8;
  });
}

function isPinfu(hand, melds, roundWind, seatWind) {
  if (melds.length > 0) return false;
  // 全て順子、雀頭が役牌でないこと
  // 簡略化: 手牌から順子構成可能か確認
  const sorted = [...hand].sort(compareTile);
  // 雀頭を探す
  for (let i = 0; i < sorted.length - 1; i++) {
    if (tilesEqual(sorted[i], sorted[i+1])) {
      const pair = sorted[i];
      // 役牌の雀頭でないか
      if (pair.suit === 'honor') {
        const windNums = [roundWind, seatWind];
        if (pair.num >= 5 || windNums.includes(pair.num)) continue; // 役牌なのでピンフ不可
      }
      const rest = [...sorted];
      rest.splice(i, 1);
      rest.splice(i, 1);
      if (allShuntsu(rest)) return true;
    }
  }
  return false;
}

function allShuntsu(tiles) {
  if (tiles.length === 0) return true;
  const first = tiles[0];
  if (first.suit === 'honor') return false;
  const n2idx = tiles.findIndex((t, i) => i > 0 && t.suit === first.suit && t.num === first.num + 1);
  const n3idx = tiles.findIndex((t, i) => i > 0 && t.suit === first.suit && t.num === first.num + 2);
  if (n2idx === -1 || n3idx === -1) return false;
  const rest = tiles.filter((_, i) => i !== 0 && i !== n2idx && i !== n3idx);
  return allShuntsu(rest);
}

function isIipeiko(hand) {
  if (hand.length !== 13) return false;
  // 同じ順子が2つあるか
  const shuntsuList = findShuntsuList(hand);
  for (let i = 0; i < shuntsuList.length; i++) {
    for (let j = i + 1; j < shuntsuList.length; j++) {
      if (shuntsuList[i].every((t, k) => tilesEqual(t, shuntsuList[j][k]))) return true;
    }
  }
  return false;
}

function isRyanpeiko(hand) {
  if (hand.length !== 13) return false;
  const shuntsuList = findShuntsuList(hand);
  if (shuntsuList.length < 4) return false;
  // 同じ順子のペアが2組
  let sameCount = 0;
  const used = new Set();
  for (let i = 0; i < shuntsuList.length; i++) {
    if (used.has(i)) continue;
    for (let j = i + 1; j < shuntsuList.length; j++) {
      if (used.has(j)) continue;
      if (shuntsuList[i].every((t, k) => tilesEqual(t, shuntsuList[j][k]))) {
        sameCount++;
        used.add(i);
        used.add(j);
        break;
      }
    }
  }
  return sameCount >= 2;
}

function findShuntsuList(hand) {
  const sorted = [...hand].sort(compareTile);
  const result = [];
  tryFindShuntsu(sorted, result);
  return result;
}

function tryFindShuntsu(tiles, result) {
  if (tiles.length === 0) return true;
  if (tiles.length === 2) {
    // 雀頭
    return tilesEqual(tiles[0], tiles[1]);
  }
  const first = tiles[0];
  if (first.suit !== 'honor' && first.num <= 7) {
    const i2 = tiles.findIndex((t, i) => i > 0 && t.suit === first.suit && t.num === first.num + 1);
    const i3 = tiles.findIndex((t, i) => i > 0 && t.suit === first.suit && t.num === first.num + 2);
    if (i2 !== -1 && i3 !== -1) {
      result.push([first, tiles[i2], tiles[i3]]);
      const rest = tiles.filter((_, i) => i !== 0 && i !== i2 && i !== i3);
      if (tryFindShuntsu(rest, result)) return true;
      result.pop();
    }
  }
  // 刻子として
  const koIdx = [0];
  for (let i = 1; i < tiles.length && koIdx.length < 3; i++) {
    if (tilesEqual(tiles[i], first)) koIdx.push(i);
  }
  if (koIdx.length >= 3) {
    const rest = tiles.filter((_, i) => !koIdx.slice(0,3).includes(i));
    if (tryFindShuntsu(rest, result)) return true;
  }
  return false;
}

function getYakuhai(tiles, roundWind, seatWind) {
  const yaku = [];
  const windNames = ['東', '南', '西', '北'];
  const dragonNames = ['白', '発', '中'];

  // 役牌 (刻子か槓子)
  const counts = countTiles(tiles);
  for (let i = 1; i <= 4; i++) {
    const count = counts[`h${i}`] || 0;
    if (count >= 3) {
      if (i === roundWind) yaku.push(`場風牌(${windNames[i-1]})`);
      if (i === seatWind) yaku.push(`自風牌(${windNames[i-1]})`);
    }
  }
  for (let i = 5; i <= 7; i++) {
    if ((counts[`h${i}`] || 0) >= 3) {
      yaku.push(`役牌(${dragonNames[i-5]})`);
    }
  }
  return yaku;
}

function calcScore(han, fu, isTsumo, isDealer) {
  if (han >= 13) return { dealer: 16000, nonDealer: 8000, tsumoDealer: 4000, tsumoNonDealer: 2000, name: '数え役満' };
  if (han >= 11) return { dealer: 12000, nonDealer: 8000, tsumoDealer: 3000, tsumoNonDealer: 2000, name: '三倍満' };
  if (han >= 8) return { dealer: 12000, nonDealer: 8000, tsumoDealer: 3000, tsumoNonDealer: 2000, name: '倍満' };
  if (han >= 6) return { dealer: 12000, nonDealer: 8000, tsumoDealer: 3000, tsumoNonDealer: 2000, name: '跳満' };
  if (han >= 5 || (han === 4 && fu >= 30) || (han === 3 && fu >= 70)) {
    return { dealer: 12000, nonDealer: 8000, tsumoDealer: 3000, tsumoNonDealer: 2000, name: '満貫' };
  }

  const base = fu * Math.pow(2, han + 2);
  const dealerRon = Math.ceil(base * 6 / 100) * 100;
  const nonDealerRon = Math.ceil(base * 4 / 100) * 100;
  const tsumoDealer = Math.ceil(base * 2 / 100) * 100;
  const tsumoNonDealer = Math.ceil(base / 100) * 100;

  return { dealer: dealerRon, nonDealer: nonDealerRon, tsumoDealer, tsumoNonDealer, name: '' };
}

// =====================
// AI ロジック
// =====================
function aiDiscard(hand, melds, roundWind, seatWind) {
  // 一番孤立した牌を捨てる
  const sorted = [...hand].sort(compareTile);

  // 各牌のスコアを計算
  let bestScore = -Infinity;
  let bestIdx = 0;

  for (let i = 0; i < sorted.length; i++) {
    const rest = sorted.filter((_, j) => j !== i);
    const score = handPotential(rest, melds);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return sorted[bestIdx];
}

function handPotential(tiles, melds) {
  let score = 0;
  const all = [...tiles, ...melds.flatMap(m => m.tiles)];

  // タンヤオ評価
  const tanyaoCount = all.filter(t => t.suit !== 'honor' && t.num >= 2 && t.num <= 8).length;
  score += tanyaoCount * 2;

  // 連続牌の評価
  const sorted = [...tiles].sort(compareTile);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].suit !== 'honor' && sorted[i+1].suit !== 'honor') {
      const diff = sorted[i+1].num - sorted[i].num;
      if (sorted[i].suit === sorted[i+1].suit) {
        if (diff === 0) score += 3; // 刻子候補
        else if (diff === 1) score += 2; // 順子候補
        else if (diff === 2) score += 1; // カンチャン
      }
    }
  }
  return score;
}

function aiShouldPon(tile, hand, melds) {
  const matching = hand.filter(t => tilesEqual(t, tile));
  if (matching.length < 2) return false;
  // 役牌ならポン
  if (tile.suit === 'honor') return true;
  return false;
}

function aiShouldChi(tile, hand, melds) {
  if (tile.suit === 'honor') return false;
  // 順子が作れるか
  const hasMinus2 = hand.some(t => t.suit === tile.suit && t.num === tile.num - 2);
  const hasMinus1 = hand.some(t => t.suit === tile.suit && t.num === tile.num - 1);
  const hasPlus1 = hand.some(t => t.suit === tile.suit && t.num === tile.num + 1);
  const hasPlus2 = hand.some(t => t.suit === tile.suit && t.num === tile.num + 2);
  return (hasMinus2 && hasMinus1) || (hasMinus1 && hasPlus1) || (hasPlus1 && hasPlus2);
}

// =====================
// ゲームクラス
// =====================
class MahjongGame {
  constructor() {
    this.players = [
      { name: '自分', score: 25000, hand: [], melds: [], discards: [], isRiichi: false, isDealer: false, drawnTile: null },
      { name: '右家', score: 25000, hand: [], melds: [], discards: [], isRiichi: false, isDealer: false, drawnTile: null },
      { name: '対面', score: 25000, hand: [], melds: [], discards: [], isRiichi: false, isDealer: false, drawnTile: null },
      { name: '左家', score: 25000, hand: [], melds: [], discards: [], isRiichi: false, isDealer: false, drawnTile: null },
    ];
    this.dealerIdx = 0;
    this.roundWind = 1; // 1=東, 2=南, 3=西, 4=北
    this.honba = 0;
    this.wall = [];
    this.doraIndicators = [];
    this.uraDoraIndicators = [];
    this.currentPlayer = 0;
    this.phase = 'idle'; // idle, draw, discard, action
    this.lastDiscard = null;
    this.lastDiscardPlayer = -1;
    this.selectedTile = null;
    this.riichiSticks = 0;
    this.riichiMode = false;

    this.start();
  }

  start() {
    this.dealRound();
  }

  dealRound() {
    // 壁牌を作成してシャッフル
    this.wall = shuffle([...TILES]);
    this.doraIndicators = [this.wall.pop()];
    this.uraDoraIndicators = [this.wall.pop()];

    // 各プレイヤーに13枚配布
    for (const p of this.players) {
      p.hand = [];
      p.melds = [];
      p.discards = [];
      p.isRiichi = false;
      p.drawnTile = null;
    }
    for (let i = 0; i < 13; i++) {
      for (let pi = 0; pi < 4; pi++) {
        const idx = (this.dealerIdx + pi) % 4;
        this.players[idx].hand.push(this.wall.pop());
      }
    }

    this.riichiMode = false;
    this.players[this.dealerIdx].isDealer = true;
    this.currentPlayer = this.dealerIdx;
    this.phase = 'draw';
    this.lastDiscard = null;
    this.lastDiscardPlayer = -1;
    this.selectedTile = null;

    this.render();
    this.updateMessage('配牌完了。ツモります...');

    setTimeout(() => this.drawTile(), 800);
  }

  drawTile() {
    if (this.wall.length <= 4) {
      this.endRound('ryukyoku');
      return;
    }

    const tile = this.wall.pop();
    const player = this.players[this.currentPlayer];
    player.hand.push(tile);
    player.drawnTile = tile;
    this.phase = 'discard';

    this.render();

    if (this.currentPlayer === 0) {
      // 自分のターン
      this.updateMessage(`ツモ ${tileHtml(tile)} — 捨てる牌を選んでください`);
      this.showTsumoButtons(tile, player);
    } else {
      // AI のターン
      this.updateMessage(`${player.name} がツモりました...`);
      setTimeout(() => this.aiTurn(), 600);
    }
  }

  showTsumoButtons(drawnTile, player) {
    const canWin = isWinningHand([...player.hand]);
    const canRiichi = !player.isRiichi && this.wall.length > 4 &&
      player.hand.some((_, i) => isTenpai(player.hand.filter((_, j) => j !== i)));
    // 暗槓: 手牌に4枚同じ牌がある
    const canKan = !player.isRiichi && player.hand.some(tile =>
      player.hand.filter(t => tilesEqual(t, tile)).length === 4
    );

    document.getElementById('btn-tsumo').disabled = !canWin;
    document.getElementById('btn-riichi').disabled = !canRiichi;
    document.getElementById('btn-ankan').disabled = !canKan;

    document.getElementById('tsumo-buttons').classList.remove('hidden');
    document.getElementById('action-buttons').classList.add('hidden');
  }

  aiTurn() {
    const player = this.players[this.currentPlayer];

    // ツモ和了チェック
    if (isWinningHand([...player.hand])) {
      this.updateMessage(`${player.name} がツモ和了！`);
      setTimeout(() => this.handleWin(this.currentPlayer, null, true), 500);
      return;
    }

    // リーチチェック
    if (!player.isRiichi && this.wall.length > 4 &&
        player.hand.some((_, i) => isTenpai(player.hand.filter((_, j) => j !== i)))) {
      const discardTile = player.hand[player.hand.length - 1]; // ツモ牌を捨てる
      player.hand.pop();
      player.isRiichi = true;
      player.discards.push(discardTile);
      this.lastDiscard = discardTile;
      this.lastDiscardPlayer = this.currentPlayer;
      this.updateMessage(`${player.name} がリーチ！`);
      this.render();
      setTimeout(() => this.afterDiscard(), 800);
      return;
    }

    // 通常捨て
    const discardTile = aiDiscard(player.hand, player.melds, this.roundWind, this.currentPlayer + 1);
    const idx = player.hand.indexOf(discardTile);
    player.hand.splice(idx, 1);
    player.discards.push(discardTile);
    this.lastDiscard = discardTile;
    this.lastDiscardPlayer = this.currentPlayer;

    this.updateMessage(`${player.name} が ${tileHtml(discardTile)} を捨てました`);
    this.render();
    setTimeout(() => this.afterDiscard(), 700);
  }

  afterDiscard() {
    // 他プレイヤーのロン・鳴きチェック
    const discard = this.lastDiscard;
    const discardPlayer = this.lastDiscardPlayer;

    // ロンチェック (優先: 他プレイヤー)
    for (let offset = 1; offset <= 3; offset++) {
      const pi = (discardPlayer + offset) % 4;
      const player = this.players[pi];
      const testHand = [...player.hand, discard];
      if (isWinningHand(testHand)) {
        if (pi === 0) {
          // 自分がロンできる
          this.showActionButtons(discard, true, false, false);
          return;
        } else {
          // AI がロン
          this.updateMessage(`${player.name} がロン！`);
          setTimeout(() => this.handleWin(pi, discardPlayer, false), 500);
          return;
        }
      }
    }

    // 鳴きチェック
    // 自分が鳴けるか
    const selfPlayer = this.players[0];
    if (discardPlayer !== 0) {
      const canPon = selfPlayer.hand.filter(t => tilesEqual(t, discard)).length >= 2;
      const canChi = discardPlayer === (0 + 3) % 4 && // 上家から
        selfPlayer.hand.some(t => t.suit === discard.suit && t.num === discard.num - 2) &&
        (selfPlayer.hand.some(t => t.suit === discard.suit && t.num === discard.num - 1) ||
         selfPlayer.hand.some(t => t.suit === discard.suit && t.num === discard.num + 1));

      if (canPon || canChi) {
        this.showActionButtons(discard, false, canPon, canChi);
        return;
      }
    }

    // AI 鳴きチェック
    let melded = false;
    for (let offset = 1; offset <= 3; offset++) {
      const pi = (discardPlayer + offset) % 4;
      if (pi === 0) continue;
      const player = this.players[pi];
      if (aiShouldPon(discard, player.hand, player.melds)) {
        this.aiMeld(pi, 'pon', discard);
        melded = true;
        break;
      }
    }

    if (!melded) {
      // 次のプレイヤーへ
      this.currentPlayer = (discardPlayer + 1) % 4;
      this.phase = 'draw';
      setTimeout(() => this.drawTile(), 300);
    }
  }

  showActionButtons(discard, canRon, canPon, canChi) {
    this.phase = 'action';
    document.getElementById('tsumo-buttons').classList.add('hidden');

    const btnDiv = document.getElementById('action-buttons');
    btnDiv.classList.remove('hidden');

    document.getElementById('btn-ron').disabled = !canRon;
    document.getElementById('btn-pon').disabled = !canPon;
    document.getElementById('btn-chi').disabled = !canChi;
    document.getElementById('btn-kan').disabled = true;

    this.updateMessage(canRon ? `ロンできます！ ${tileHtml(discard)}` : `鳴けます！ ${tileHtml(discard)}`);
  }

  playerAction(action) {
    document.getElementById('action-buttons').classList.add('hidden');
    document.getElementById('tsumo-buttons').classList.add('hidden');

    const player = this.players[0];

    if (action === 'ron') {
      this.handleWin(0, this.lastDiscardPlayer, false);
    } else if (action === 'tsumo') {
      this.handleWin(0, null, true);
    } else if (action === 'ankan') {
      this.performAnkan();
    } else if (action === 'riichi') {
      // リーチ宣言モード: テンパイになる牌を選ばせる
      this.riichiMode = true;
      document.getElementById('tsumo-buttons').classList.add('hidden');
      this.updateMessage('リーチ宣言 — 捨てる牌をクリックしてください（緑枠の牌が切れます）');
      this.render();
      return;
    } else if (action === 'pon') {
      this.playerMeld('pon', this.lastDiscard);
    } else if (action === 'chi') {
      this.playerMeld('chi', this.lastDiscard);
    } else if (action === 'skip' || action === 'tsumo-skip') {
      // スキップ: 次のプレイヤーへ
      if (action === 'tsumo-skip') {
        // 手牌から捨てる
        this.updateMessage('捨てる牌を選んでクリックしてください');
        this.phase = 'discard';
        this.render();
        return;
      }
      this.currentPlayer = (this.lastDiscardPlayer + 1) % 4;
      this.phase = 'draw';
      setTimeout(() => this.drawTile(), 300);
    }
  }

  playerMeld(type, discard) {
    const player = this.players[0];

    if (type === 'pon') {
      const tiles = player.hand.filter(t => tilesEqual(t, discard)).slice(0, 2);
      for (const t of tiles) player.hand.splice(player.hand.indexOf(t), 1);
      player.melds.push({ type: 'pon', tiles: [...tiles, discard], from: this.lastDiscardPlayer });
    } else if (type === 'chi') {
      // 最初に見つかる順子を使う
      const n = discard.num;
      const s = discard.suit;
      let t1, t2;
      if (player.hand.find(t => t.suit === s && t.num === n - 2) && player.hand.find(t => t.suit === s && t.num === n - 1)) {
        t1 = player.hand.find(t => t.suit === s && t.num === n - 2);
        t2 = player.hand.find(t => t.suit === s && t.num === n - 1);
      } else if (player.hand.find(t => t.suit === s && t.num === n - 1) && player.hand.find(t => t.suit === s && t.num === n + 1)) {
        t1 = player.hand.find(t => t.suit === s && t.num === n - 1);
        t2 = player.hand.find(t => t.suit === s && t.num === n + 1);
      } else {
        t1 = player.hand.find(t => t.suit === s && t.num === n + 1);
        t2 = player.hand.find(t => t.suit === s && t.num === n + 2);
      }
      player.hand.splice(player.hand.indexOf(t1), 1);
      player.hand.splice(player.hand.indexOf(t2), 1);
      player.melds.push({ type: 'chi', tiles: [t1, t2, discard].sort(compareTile), from: this.lastDiscardPlayer });
    }

    this.currentPlayer = 0;
    this.phase = 'discard';
    this.players[0].drawnTile = null;
    this.updateMessage('捨てる牌を選んでクリックしてください');
    this.render();
  }

  performAnkan() {
    const player = this.players[0];
    // 4枚ある牌を探す
    const kanTile = player.hand.find(tile =>
      player.hand.filter(t => tilesEqual(t, tile)).length === 4
    );
    if (!kanTile) return;

    // 4枚を手牌から除いて副露へ
    const kanTiles = [];
    for (let i = player.hand.length - 1; i >= 0; i--) {
      if (tilesEqual(player.hand[i], kanTile)) {
        kanTiles.unshift(player.hand.splice(i, 1)[0]);
      }
    }
    player.melds.push({ type: 'ankan', tiles: kanTiles, from: -1 });

    // 新ドラ表示牌を追加
    if (this.wall.length > 4) {
      this.doraIndicators.push(this.wall[0]);
    }

    // 嶺上牌をツモ
    if (this.wall.length <= 4) {
      this.endRound('ryukyoku');
      return;
    }
    const rinshan = this.wall.pop();
    player.hand.push(rinshan);
    player.drawnTile = rinshan;

    this.updateMessage(`暗槓！ ツモ ${tileHtml(rinshan)} — 捨てる牌を選んでください`);
    this.render();
    this.showTsumoButtons(rinshan, player);
  }

  aiMeld(playerIdx, type, discard) {
    const player = this.players[playerIdx];
    if (type === 'pon') {
      const tiles = player.hand.filter(t => tilesEqual(t, discard)).slice(0, 2);
      for (const t of tiles) player.hand.splice(player.hand.indexOf(t), 1);
      player.melds.push({ type: 'pon', tiles: [...tiles, discard], from: this.lastDiscardPlayer });
      this.currentPlayer = playerIdx;
      this.updateMessage(`${player.name} がポン！`);

      // AI が捨て牌を選ぶ
      const discardTile = aiDiscard(player.hand, player.melds, this.roundWind, playerIdx + 1);
      const idx = player.hand.indexOf(discardTile);
      player.hand.splice(idx, 1);
      player.discards.push(discardTile);
      this.lastDiscard = discardTile;
      this.lastDiscardPlayer = playerIdx;
      this.render();
      setTimeout(() => this.afterDiscard(), 800);
    }
  }

  playerDiscard(tileIdx) {
    if (this.phase !== 'discard' || this.currentPlayer !== 0) return;

    const player = this.players[0];
    if (tileIdx < 0 || tileIdx >= player.hand.length) return;

    const tile = player.hand[tileIdx];

    // リーチ中はツモ牌しか捨てられない
    if (player.isRiichi && tileIdx !== player.hand.length - 1) {
      this.updateMessage('リーチ中はツモ牌しか捨てられません');
      return;
    }

    // リーチ宣言モード: テンパイになる牌のみ捨てられる
    if (this.riichiMode) {
      const remaining = player.hand.filter((_, i) => i !== tileIdx);
      if (!isTenpai(remaining)) {
        this.updateMessage('この牌を切るとテンパイになりません。別の牌を選んでください。');
        return;
      }
      // リーチ確定
      this.riichiMode = false;
      player.hand.splice(tileIdx, 1);
      player.discards.push(tile);
      player.drawnTile = null;
      player.isRiichi = true;
      this.lastDiscard = tile;
      this.lastDiscardPlayer = 0;
      this.selectedTile = null;
      this.riichiSticks++;
      this.render();
      this.updateMessage(`リーチ！ ${tileHtml(tile)} を捨てました`);
      setTimeout(() => this.afterDiscard(), 600);
      return;
    }

    player.hand.splice(tileIdx, 1);
    player.discards.push(tile);
    player.drawnTile = null;
    this.lastDiscard = tile;
    this.lastDiscardPlayer = 0;
    this.selectedTile = null;

    this.render();
    this.updateMessage(`${tileHtml(tile)} を捨てました`);
    setTimeout(() => this.afterDiscard(), 400);
  }

  handleWin(winnerIdx, loserIdx, isTsumo) {
    const winner = this.players[winnerIdx];
    const isDealer = winnerIdx === this.dealerIdx;
    const drawnTile = winner.drawnTile || winner.hand[winner.hand.length - 1];

    // ドラ確定
    const doraList = this.doraIndicators.map(d => getDoraFromIndicator(d));
    const uraDoraList = winner.isRiichi ? this.uraDoraIndicators.map(d => getDoraFromIndicator(d)) : [];

    const result = evaluateHand(
      winner.hand, winner.melds, drawnTile,
      isTsumo, winner.isRiichi,
      this.roundWind, winnerIdx + 1,
      doraList, uraDoraList
    );

    if (!result) {
      // 役なし (フリテンなど)
      if (isTsumo) {
        this.updateMessage('役なし — 捨てる牌を選んでクリックしてください');
        this.phase = 'discard';
        this.render();
        this.showTsumoButtons(drawnTile, winner);
      } else {
        this.updateMessage('役なし — ロン不可');
        this.currentPlayer = (loserIdx + 1) % 4;
        this.phase = 'draw';
        setTimeout(() => this.drawTile(), 800);
      }
      return;
    }

    const scoreChanges = new Array(4).fill(0);
    let winScore = 0;

    if (isTsumo) {
      if (isDealer) {
        for (let i = 0; i < 4; i++) {
          if (i !== winnerIdx) {
            scoreChanges[i] -= result.score.tsumoDealer + this.honba * 100;
            winScore += result.score.tsumoDealer + this.honba * 100;
          }
        }
      } else {
        for (let i = 0; i < 4; i++) {
          if (i === winnerIdx) continue;
          const pay = i === this.dealerIdx ? result.score.tsumoDealer : result.score.tsumoNonDealer;
          scoreChanges[i] -= pay + this.honba * 100;
          winScore += pay + this.honba * 100;
        }
      }
    } else {
      const pay = isDealer ? result.score.dealer : result.score.nonDealer;
      winScore = pay + this.honba * 300;
      scoreChanges[loserIdx] -= winScore;
    }
    scoreChanges[winnerIdx] += winScore + this.riichiSticks * 1000;
    this.riichiSticks = 0;

    for (let i = 0; i < 4; i++) {
      this.players[i].score += scoreChanges[i];
    }

    // 結果表示
    this.showResult(winner, result, scoreChanges, isTsumo, loserIdx);

    // 連荘 or 次局
    if (winnerIdx === this.dealerIdx) {
      this.honba++;
    } else {
      this.dealerIdx = (this.dealerIdx + 1) % 4;
      this.honba = 0;
      if (this.dealerIdx === 0) {
        this.roundWind++;
        if (this.roundWind > 2) {
          this.endGame();
          return;
        }
      }
    }
  }

  showResult(winner, result, scoreChanges, isTsumo, loserIdx) {
    const modal = document.getElementById('result-modal');
    const title = document.getElementById('result-title');
    const detail = document.getElementById('result-detail');
    const scoreDiv = document.getElementById('score-changes');

    title.textContent = isTsumo ? `${winner.name} ツモ和了！` : `${winner.name} ロン！`;

    detail.innerHTML = `
      <div><strong>役:</strong> ${result.yaku.join('、')}</div>
      <div><strong>${result.han}翻 ${result.fu}符</strong> ${result.score.name}</div>
      <div style="margin-top:8px">
        ${winner.hand.map(t => `<span class="tile small ${tileClass(t)}">${tileDisplay(t)}</span>`).join('')}
      </div>
    `;

    scoreDiv.innerHTML = this.players.map((p, i) => {
      const change = scoreChanges[i];
      const cls = change > 0 ? 'score-plus' : change < 0 ? 'score-minus' : '';
      return `<div class="score-change-row">
        <span>${p.name}</span>
        <span>${p.score} <span class="${cls}">(${change >= 0 ? '+' : ''}${change})</span></span>
      </div>`;
    }).join('');

    modal.classList.remove('hidden');
    this.render();
  }

  nextRound() {
    document.getElementById('result-modal').classList.add('hidden');
    this.dealRound();
  }

  endRound(reason) {
    if (reason === 'ryukyoku') {
      this.updateMessage('流局！');
      // テンパイ罰符
      const tenpaiPlayers = this.players.filter(p => isTenpai(p.hand));
      const notenPlayers = this.players.filter(p => !isTenpai(p.hand));

      if (tenpaiPlayers.length > 0 && notenPlayers.length > 0) {
        const pay = 3000 / tenpaiPlayers.length;
        const get = 3000 / notenPlayers.length;
        for (const p of tenpaiPlayers) p.score += get;
        for (const p of notenPlayers) p.score -= pay;
      }

      this.honba++;
      setTimeout(() => {
        this.render();
        this.dealRound();
      }, 1500);
    }
  }

  endGame() {
    const modal = document.getElementById('gameover-modal');
    const finalDiv = document.getElementById('final-scores');

    const ranked = [...this.players].sort((a, b) => b.score - a.score);
    finalDiv.innerHTML = ranked.map((p, i) => `
      <div class="final-score-row ${i === 0 ? 'rank-1' : ''}">
        <span>${i + 1}位: ${p.name}</span>
        <span>${p.score.toLocaleString()} 点</span>
      </div>
    `).join('');

    modal.classList.remove('hidden');
  }

  restart() {
    document.getElementById('gameover-modal').classList.add('hidden');
    for (const p of this.players) p.score = 25000;
    this.dealerIdx = 0;
    this.roundWind = 1;
    this.honba = 0;
    this.riichiSticks = 0;
    this.dealRound();
  }

  updateMessage(msg) {
    document.getElementById('message-area').innerHTML = msg;
  }

  // =====================
  // 描画
  // =====================
  render() {
    this.renderHeader();
    this.renderPlayer0();
    this.renderOpponents();
    this.renderDora();
  }

  renderHeader() {
    const winds = ['東', '南', '西', '北'];
    const roundName = winds[this.roundWind - 1] + (Math.floor(this.dealerIdx) + 1) + '局';
    document.getElementById('round-info').textContent = roundName;
    document.getElementById('honba-info').textContent = `${this.honba}本場`;
    document.getElementById('wall-count').textContent = `残り: ${this.wall.length}`;

    document.getElementById('wind-indicator').querySelector('.wind-kanji').textContent = winds[this.roundWind - 1];

    // スコア更新
    for (let i = 0; i < 4; i++) {
      document.getElementById(`score-${i}`).textContent = this.players[i].score.toLocaleString();
    }

    // リーチ表示
    const riichiIndicator = document.getElementById('riichi-indicator');
    if (this.players[0].isRiichi) {
      riichiIndicator.classList.remove('hidden');
    } else {
      riichiIndicator.classList.add('hidden');
    }
  }

  renderPlayer0() {
    const player = this.players[0];
    const handDiv = document.getElementById('hand-0');
    handDiv.innerHTML = '';

    // ツモ牌は常に hand の末尾にある（push で追加するため）
    const hasDrawn = !!player.drawnTile && player.hand.length > 0;
    const drawnTile = hasDrawn ? player.hand[player.hand.length - 1] : null;
    const mainTiles = hasDrawn ? [...player.hand.slice(0, -1)].sort(compareTile) : [...player.hand].sort(compareTile);

    const makeTileEl = (tile, isDrawn) => {
      const el = document.createElement('span');
      el.className = `tile ${tileClass(tile)}`;
      if (isDrawn) el.classList.add('drawn');
      // リーチモード: テンパイになる牌をハイライト
      if (this.riichiMode) {
        const idx = player.hand.findIndex(t => t === tile);
        const remaining = player.hand.filter((_, i) => i !== idx);
        if (isTenpai(remaining)) el.classList.add('riichi-candidate');
      }
      el.innerHTML = tileDisplay(tile);
      el.onclick = () => {
        if (this.phase === 'discard' && this.currentPlayer === 0) {
          this.playerDiscard(player.hand.findIndex(t => t === tile));
        }
      };
      return el;
    };

    // 手牌をメインとツモ牌の2ブロックに分けて表示
    // メイン13枚
    const mainGroup = document.createElement('div');
    mainGroup.style.cssText = 'display:flex;gap:3px;align-items:flex-end;flex-wrap:nowrap;';
    for (const tile of mainTiles) {
      mainGroup.appendChild(makeTileEl(tile, false));
    }
    handDiv.appendChild(mainGroup);

    // ツモ牌（独立コンテナで確実に右端表示）
    if (drawnTile) {
      const drawGroup = document.createElement('div');
      drawGroup.style.cssText = 'display:flex;flex-direction:column;align-items:center;margin-left:40px;flex-shrink:0;';
      const label = document.createElement('div');
      label.textContent = 'ツモ';
      label.style.cssText = 'font-size:0.55rem;color:#f0c060;font-weight:bold;line-height:1;margin-bottom:2px;';
      drawGroup.appendChild(label);
      drawGroup.appendChild(makeTileEl(drawnTile, true));
      handDiv.appendChild(drawGroup);
    }

    // 副露表示
    if (player.melds.length > 0) {
      const sep = document.createElement('span');
      sep.className = 'hand-separator';
      handDiv.appendChild(sep);

      const meldGroup = document.createElement('div');
      meldGroup.className = 'meld-group';
      for (const meld of player.melds) {
        const meldEl = document.createElement('div');
        meldEl.className = 'meld';
        for (const t of meld.tiles) {
          const tel = document.createElement('span');
          tel.className = `tile small ${tileClass(t)}`;
          tel.innerHTML = tileDisplay(t);
          meldEl.appendChild(tel);
        }
        meldGroup.appendChild(meldEl);
      }
      handDiv.appendChild(meldGroup);
    }

    // 捨て牌
    const discardDiv = document.getElementById('discard-0');
    discardDiv.innerHTML = '';
    for (const t of player.discards) {
      const el = document.createElement('span');
      el.className = `tile small ${tileClass(t)}`;
      el.innerHTML = tileDisplay(t);
      discardDiv.appendChild(el);
    }
  }

  renderOpponents() {
    // 右家: player 1, 対面: player 2, 左家: player 3
    const positions = [
      { domIdx: 1, handDom: 'hand-1', discardDom: 'discard-1', isSide: true },
      { domIdx: 2, handDom: 'hand-2', discardDom: 'discard-2', isSide: false },
      { domIdx: 3, handDom: 'hand-3', discardDom: 'discard-3', isSide: true },
    ];

    for (const pos of positions) {
      const player = this.players[pos.domIdx];
      const handDiv = document.getElementById(pos.handDom);
      handDiv.innerHTML = '';

      // 伏せ牌
      for (let i = 0; i < player.hand.length; i++) {
        const el = document.createElement('span');
        el.className = pos.isSide ? 'tile back tiny' : 'tile back vertical-tile';
        el.textContent = pos.isSide ? '' : '🀫';
        handDiv.appendChild(el);
      }

      // 捨て牌
      const discardDiv = document.getElementById(pos.discardDom);
      discardDiv.innerHTML = '';
      for (const t of player.discards) {
        const el = document.createElement('span');
        el.className = `tile small ${tileClass(t)}`;
        if (player.isRiichi && t === player.discards[player.discards.length - (player.hand.length > 0 ? 1 : 1)]) {
          el.classList.add('riichi-tile');
        }
        el.innerHTML = tileDisplay(t);
        discardDiv.appendChild(el);
      }
    }
  }

  renderDora() {
    const doraDiv = document.getElementById('dora-tiles');
    doraDiv.innerHTML = '';
    for (const ind of this.doraIndicators) {
      const dora = getDoraFromIndicator(ind);
      const el = document.createElement('span');
      el.className = `tile small ${tileClass(dora)}`;
      el.innerHTML = tileDisplay(dora);
      doraDiv.appendChild(el);
    }
  }
}

function getDoraFromIndicator(indicator) {
  if (indicator.suit === 'honor') {
    // 風牌: 東→南→西→北→東, 三元牌: 白→発→中→白
    if (indicator.num <= 4) {
      const next = indicator.num === 4 ? 1 : indicator.num + 1;
      return { suit: 'honor', num: next, honor: HONOR_NAMES[next - 1], copy: 0, id: `honor${next}_dora` };
    } else {
      const next = indicator.num === 7 ? 5 : indicator.num + 1;
      return { suit: 'honor', num: next, honor: HONOR_NAMES[next - 1], copy: 0, id: `honor${next}_dora` };
    }
  } else {
    const next = indicator.num === 9 ? 1 : indicator.num + 1;
    return { suit: indicator.suit, num: next, copy: 0, id: `${indicator.suit}${next}_dora` };
  }
}

// ゲーム開始
let game;
document.addEventListener('DOMContentLoaded', () => {
  try {
    game = new MahjongGame();
  } catch (e) {
    const msgEl = document.getElementById('message-area');
    if (msgEl) msgEl.textContent = `起動エラー: ${e.message}`;
    console.error(e);
  }
});
