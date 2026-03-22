import { useState, } from 'react';
import './MedakaSim.css';
import wildMedakaImg from './assets/wild_medaka.png';
import domesticMedakaBlack from './assets/domestic_black.png';
import domesticMedakaRed from './assets/domestic_red.png';
import domesticMedakaBlue from './assets/domestic_blue.png';

// メダカの遺伝子型を定義
// 野生(A): 優性, 改良(a): 劣性
// AA: 野生(茶), Aa: 交雑(茶), aa: 改良(オレンジ)
const GENOTYPE = {
    WW: 'AA',
    WD: 'Aa',
    DD: 'aa'
};

// 色の定義と被食率・老衰その他の死亡率
// オーバーラップモデル（生き残った親も次世代へ進む）。
// (自然死生存率:0.5) と (被食生存率:0.8) を組み合わせ、AAが完璧に維持(1.0倍)されるよう産卵数(1.5倍)を設定。
// 式: 0.5 * (1 + 1.5) * 0.8 = 1.0!
const PHENOTYPE = {
    WILD: { color: 'brown', naturalDeathRate: 0.50, isEatenRate: 0.30, label: '野生メダカ', imgs: [wildMedakaImg] },
    HYBRID: { color: 'brown', naturalDeathRate: 0.50, isEatenRate: 0.35, label: '交雑メダカ(野生色)', imgs: [wildMedakaImg] },
    DOMESTIC: { color: 'orange', naturalDeathRate: 0.50, isEatenRate: 0.45, label: '改良メダカ', imgs: [domesticMedakaBlack, domesticMedakaRed, domesticMedakaBlue] }
};

const getPhenotype = (genotype) => {
    if (genotype === GENOTYPE.WW) return PHENOTYPE.WILD;
    if (genotype === GENOTYPE.WD) return PHENOTYPE.HYBRID;
    return PHENOTYPE.DOMESTIC;
};

// 初期池の設定（定数）
const INITIAL_WILD_COUNT = 50;
const INITIAL_POND_CAPACITY = 100;


export default function MedakaSim() {
    const [gameState, setGameState] = useState('SETUP'); // SETUP, SIMULATING, RESULT
    const [releaseCount, setReleaseCount] = useState(10);
    const [generation, setGeneration] = useState(0);
    const [fishes, setFishes] = useState([]);
    const [history, setHistory] = useState([]);
    const [transitionStats, setTransitionStats] = useState(null);
    const [showTransitionOverlay, setShowTransitionOverlay] = useState(true);

    // 初期化関数
    const initSimulation = () => {
        // ユーザー指示「そもそも放流前の50が安定」のため、野生メダカの初期数を50匹で固定
        const INITIAL_WILD_COUNT = 50;
        const initialFishes = [];
        // メダカの初期年齢を「0歳40%」「1歳35%」「2歳25%」になるように、全体数からキッチリ割り当てる関数（ガチャ廃止・最大剰余方式）
        const createFishesDetereministic = (count, genotypeStr, idPrefix) => {
            const exact0 = count * 0.40;
            const exact1 = count * 0.35;
            const exact2 = count * 0.25;

            let count0 = Math.floor(exact0);
            let count1 = Math.floor(exact1);
            let count2 = Math.floor(exact2);

            let remaining = count - (count0 + count1 + count2);

            const remainders = [
                { age: 0, rem: exact0 - count0 },
                { age: 1, rem: exact1 - count1 },
                { age: 2, rem: exact2 - count2 }
            ];
            remainders.sort((a, b) => b.rem - a.rem);

            for (let i = 0; i < remaining; i++) {
                if (remainders[i].age === 0) count0++;
                else if (remainders[i].age === 1) count1++;
                else count2++;
            }

            const fishesToReturn = [];
            let generated = 0;

            // 決定した数だけ年齢別に生成
            const pushAgeGroup = (ageCount, ageValue) => {
                for (let i = 0; i < ageCount; i++) {
                    fishesToReturn.push({
                        id: `${idPrefix}-${generated++}`,
                        genotype: genotypeStr,
                        age: ageValue
                    });
                }
            };

            pushAgeGroup(count0, 0);
            pushAgeGroup(count1, 1);
            pushAgeGroup(count2, 2);

            return fishesToReturn;
        };

        // 野生メダカと改良メダカを、それぞれ全体数ベースでキッチリ配分して追加
        initialFishes.push(...createFishesDetereministic(INITIAL_WILD_COUNT, GENOTYPE.WW, 'initial-w'));
        initialFishes.push(...createFishesDetereministic(releaseCount, GENOTYPE.DD, 'initial-d'));

        setFishes(initialFishes);
        setGeneration(0);
        setHistory([calculateStats(initialFishes, 0)]);
        setGameState('SIMULATING');
    };

    // 統計情報の計算
    const calculateStats = (currentFishes, gen) => {
        let pureWildCount = 0;
        let hybridCount = 0;
        let domesticCount = 0;
        currentFishes.forEach(f => {
            const p = getPhenotype(f.genotype);
            if (p === PHENOTYPE.WILD) {
                pureWildCount++;
            } else if (p === PHENOTYPE.HYBRID) {
                hybridCount++;
            } else {
                domesticCount++;
            }
        });
        return { generation: gen, total: currentFishes.length, pureWild: pureWildCount, hybrid: hybridCount, domestic: domesticCount };
    };

    // 交配と遺伝のロジック


    // 世代を進める関数 (1世代でのイベント)
    // 世代を進める関数 (数学的・決定論的な計算)
    const nextGeneration = () => {
        let nextIdCounter = generation * 1000;

        let eatenCount = 0;
        let deadCount = 0;

        // 汎用ハイブリッド生死判定関数（デフォルト: 70%を計算配分、30%を個体ガチャ）
        const applyHybridDeathFilter = (fishesArray, getProbFn, detRatio = 0.70) => {
            if (fishesArray.length === 0) return { survivors: [], newDeadCount: 0 };

            const shuffled = [...fishesArray].sort(() => Math.random() - 0.5);
            const detLimit = Math.floor(shuffled.length * detRatio);

            const detPool = shuffled.slice(0, detLimit);
            const randPool = shuffled.slice(detLimit);

            let deadCountTotal = 0;
            const deadIds = new Set();

            // --- 1. 確定(決定論的)配分パート ---
            let totalExpected = 0;
            const fishWithProb = [];

            detPool.forEach(f => {
                const p = getProbFn(f);
                if (p >= 1.0) {
                    deadIds.add(f.id);
                    deadCountTotal++;
                } else if (p > 0.0) {
                    totalExpected += p;
                    fishWithProb.push({ fish: f, p });
                }
            });

            // 期待される死者数の最も確からしい整数を割り当てる
            const targetDead = Math.round(totalExpected);
            fishWithProb.sort((a, b) => b.p - a.p); // 確率が高い順

            for (let i = 0; i < targetDead && i < fishWithProb.length; i++) {
                deadIds.add(fishWithProb[i].fish.id);
                deadCountTotal++;
            }

            // --- 2. ランダム配分パート ---
            randPool.forEach(f => {
                const p = getProbFn(f);
                if (Math.random() < p) {
                    deadIds.add(f.id);
                    deadCountTotal++;
                }
            });

            const survivors = fishesArray.filter(f => !deadIds.has(f.id));
            return { survivors, newDeadCount: deadCountTotal };
        };

        // 1. 繁殖（春：全ての親が一斉に産卵する）
        // ランダム判定の前に、まず数を最大化して母数(N)を大きくすることで、
        // 「大数の法則」によりバラつき（ブレ）が自然に最小化されます。
        const REPRODUCTION_RATE = 1.0;
        let newBabiesCount = Math.round(fishes.length * REPRODUCTION_RATE);
        if (newBabiesCount < 0) newBabiesCount = 0;

        let babyFishes = [];
        if (fishes.length > 0 && newBabiesCount > 0) {
            const sumAA = fishes.filter(f => f.genotype === 'AA').length;
            const sumAa = fishes.filter(f => f.genotype === 'Aa').length;
            const totalAlleles = fishes.length * 2;
            const p = (sumAA * 2 + sumAa) / totalAlleles; // Aの割合
            const q = 1 - p; // aの割合

            const freqAA = p * p;
            const freqAa = 2 * p * q;
            const freqaa = q * q;

            // 【ハイブリッド方式：9割を決定論的（キッチリ配分）、1割をランダム（ガチャ）】
            // 確実な大筋の傾向を維持しつつ、自然界らしい「ゆらぎ（ブレ）」を少し生ませる
            const DETERMINISTIC_RATIO = 0.90;
            const detCount = Math.floor(newBabiesCount * DETERMINISTIC_RATIO);
            const randCount = newBabiesCount - detCount;

            // --- 1. 確定配分パート（最大剰余方式） ---
            const exactAA = detCount * freqAA;
            const exactAa = detCount * freqAa;
            const exactaa = detCount * freqaa;

            let countAA = Math.floor(exactAA);
            let countAa = Math.floor(exactAa);
            let countaa = Math.floor(exactaa);

            let remainingBabies = detCount - (countAA + countAa + countaa);

            const remainders = [
                { type: 'AA', rem: exactAA - countAA },
                { type: 'Aa', rem: exactAa - countAa },
                { type: 'aa', rem: exactaa - countaa }
            ];
            remainders.sort((a, b) => b.rem - a.rem);

            for (let i = 0; i < remainingBabies; i++) {
                if (remainders[i].type === 'AA') countAA++;
                else if (remainders[i].type === 'Aa') countAa++;
                else countaa++;
            }

            // --- 2. ランダム（ガチャ）配分パート ---
            for (let i = 0; i < randCount; i++) {
                const r = Math.random();
                if (r < freqAA) countAA++;
                else if (r < freqAA + freqAa) countAa++;
                else countaa++;
            }

            // 決定された数の通りに子供を生成
            const pushBabies = (count, genotype) => {
                for (let i = 0; i < count; i++) {
                    babyFishes.push({
                        id: `gen${generation + 1}-${nextIdCounter++}`,
                        genotype: genotype,
                        age: 0
                    });
                }
            };

            pushBabies(countAA, 'AA');
            pushBabies(countAa, 'Aa');
            pushBabies(countaa, 'aa');
        }

        // 親(年齢を+1)と産まれたばかりの子供を合流させる（池の総数がここで最大になる）
        let pondFishes = fishes.map(f => ({ ...f, age: f.age + 1 }));
        pondFishes = [...pondFishes, ...babyFishes];

        // 2. 被食（夏〜秋：天敵による捕食プレッシャー）
        const BASE_CAPACITY_PREDATION = 50;
        const densityRatio = pondFishes.length / BASE_CAPACITY_PREDATION;

        let densityScale = 1.0;
        if (densityRatio > 1.0) {
            densityScale = 1.0 + (densityRatio - 1.0) * 0.10;
        } else {
            densityScale = 1.0 - (1.0 - densityRatio) * 0.10;
        }

        const getEatenRate = (fish) => {
            const phenotype = getPhenotype(fish.genotype);
            let p = phenotype.isEatenRate * densityScale;
            if (p > 0.95) return 0.95;
            if (p < 0.0) return 0.0;
            return p;
        };

        // 被食判定のみ、60%計算・40%ガチャの割合を適用
        const predationResult = applyHybridDeathFilter(pondFishes, getEatenRate, 0.60);
        eatenCount += predationResult.newDeadCount;
        let postPredationFishes = predationResult.survivors;

        // 3. 冬：病死と、年齢に応じた寿命による死
        // ① 病死（全年齢共通:15%）
        const diseaseResult = applyHybridDeathFilter(postPredationFishes, () => 0.15);
        deadCount += diseaseResult.newDeadCount;
        let postDiseaseFishes = diseaseResult.survivors;

        // ② 寿命死（病気を乗り越えた個体にのみ襲いかかる老い）
        const getAgeDeathRate = (fish) => {
            if (fish.age === 0) return 0.0;
            if (fish.age === 1) return 0.10;
            if (fish.age === 2) return 0.20;
            if (fish.age === 3) return 0.65;
            return 1.0;
        };

        const ageResult = applyHybridDeathFilter(postDiseaseFishes, getAgeDeathRate);
        deadCount += ageResult.newDeadCount;
        const finalFishes = ageResult.survivors;

        setFishes(finalFishes);
        const nextGen = generation + 1;
        setGeneration(nextGen);
        setHistory([...history, calculateStats(finalFishes, nextGen)]);

        if (showTransitionOverlay) {
            setTransitionStats({
                eatenCount,
                deadCount,
                birthCount: newBabiesCount
            });
        }
    };


    return (
        <div className="sim-container">
            <header className="sim-header">
                <h1>メダカ放流シミュレーション</h1>
                <p className="subtitle">〜遺伝子汚染について学ぼう〜</p>
            </header>

            {gameState === 'SETUP' && (
                <div className="setup-panel">
                    <h2>放流する改良メダカの数を決めよう</h2>
                    <div className="setting-box">
                        <p>池には最初から<strong>{INITIAL_WILD_COUNT}匹</strong>の野生メダカが住んでいます。</p>
                        <p>池の定員はだいたい{INITIAL_POND_CAPACITY}匹です。</p>

                        <div className="slider-container">
                            <label>放流する改良メダカ： <span>{releaseCount}</span> 匹</label>
                            <input
                                type="range"
                                min="1" max="50"
                                value={releaseCount}
                                onChange={(e) => setReleaseCount(Number(e.target.value))}
                            />
                        </div>

                        <button className="start-btn" onClick={initSimulation}>シミュレーション開始！</button>
                    </div>
                    <div className="fish-info-cards">
                        <div className="card">
                            <img src={PHENOTYPE.WILD.imgs[0]} alt="野生メダカ" />
                            <h3>野生メダカのカと非対称な環境収容力</h3>
                            <ul>
                                <li><strong>病死と寿命の概念:</strong> メダカ1匹ごとに冬の試練が訪れます。まず「病死（一律15%）」に直面し、それを乗り越えた個体が年齢別確率（0歳0%, 1歳10%, 2歳20%, 3歳65%, 4歳100%）に直面します。今回は初期開始時の年齢が「0歳20%、1歳50%、2歳30%」でスタートします。</li>
                                <li><strong>大数の法則:</strong> 春に産卵して母数を最大化させ、年齢と寿命に基づくリアルな死のサイクルを回すことで、自然界の美しい安定を運ゲーなしで表現しています！</li>
                                <li><strong>さらに緩やかな環境圧:</strong> 天敵に見つかりやすくなる「過密ペナルティ」を大幅に弱めました。これにより少しの放流では生態系が耐え切りやすくなり、数が増えた時だけジリジリと環境圧が働き、より自然な変化を生み出します。</li>
                            </ul>
                        </div>
                        <div className="card">
                            <img src={PHENOTYPE.DOMESTIC.imgs[0]} alt="改良メダカ" />
                            <h3>放流数に比例する生態系破壊</h3>
                            <ul>
                                <li><strong>改良(aa):</strong> 目立つオレンジ色のため天敵に非常に食べられやすいです（基準：35%被食）。</li>
                                <li><strong>交雑メダカ(Aa):</strong> 野生と同じ見た目ですがほんの少しだけ野生より劣ります（基準：35%被食）。</li>
                                <li><strong>深い下落:</strong> Aaやaaによる「道連れ現象の毒」に対して、減った時の救済（隠れ場所による生存率アップ）が弱いため、個体数の減少は容易には止まりません。</li>
                                <li>放流時の改良メダカ(a)の比率が大きいほど、池全体の被害も大きくなり、最終的に「25〜10匹程度」という非常に低く絶望的なラインまで深く生態系が破壊されていきます。</li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {gameState === 'SIMULATING' && (
                <div className="simulation-panel">
                    <div className="stats-header">
                        <h2>世代: {generation}</h2>
                        <div className="count-badges">
                            <span className="badge wild">野生(AA): {history[history.length - 1]?.pureWild || 0}匹</span>
                            <span className="badge hybrid">交雑(Aa): {history[history.length - 1]?.hybrid || 0}匹</span>
                            <span className="badge domestic">改良(aa): {history[history.length - 1]?.domestic || 0}匹</span>
                            <span className="badge total">合計: {history[history.length - 1]?.total || 0}匹</span>
                        </div>

                    </div>

                    <div className="main-simulation-content">
                        <div className="side-table-area">
                            <h3>現在の生息数 (遺伝子・年齢別)</h3>
                            <table className="age-distribution-table">
                                <thead>
                                    <tr>
                                        <th>年齢</th>
                                        <th className="th-wild">AA</th>
                                        <th className="th-hybrid">Aa</th>
                                        <th className="th-domestic">aa</th>
                                        <th>計</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[0, 1, 2, 3, 4].map(age => {
                                        const countAA = fishes.filter(f => f.genotype === 'AA' && f.age === age).length;
                                        const countAa = fishes.filter(f => f.genotype === 'Aa' && f.age === age).length;
                                        const countaa = fishes.filter(f => f.genotype === 'aa' && f.age === age).length;
                                        return (
                                            <tr key={`age-${age}`}>
                                                <td>{age === 4 ? '4歳以上' : `${age}歳`}</td>
                                                <td>{countAA}</td>
                                                <td>{countAa}</td>
                                                <td>{countaa}</td>
                                                <td className="row-total">{countAA + countAa + countaa}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td>合計</td>
                                        <td>{fishes.filter(f => f.genotype === 'AA').length}</td>
                                        <td>{fishes.filter(f => f.genotype === 'Aa').length}</td>
                                        <td>{fishes.filter(f => f.genotype === 'aa').length}</td>
                                        <td className="row-total">{fishes.length}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        <div className="pond-area">
                            {transitionStats && (
                                <div className="transition-overlay">
                                    <div className="transition-box">
                                        <h3>{generation}世代目の結果</h3>
                                        <p className="transition-stat stat-eaten">鳥に食べられた: {transitionStats.eatenCount} 匹</p>
                                        <p className="transition-stat stat-dead">老衰・病死: {transitionStats.deadCount} 匹</p>
                                        <p className="transition-stat stat-born">新しく生まれた: {transitionStats.birthCount} 匹</p>
                                        <button onClick={() => setTransitionStats(null)}>確認して進む</button>
                                    </div>
                                </div>
                            )}
                            {fishes.length === 0 ? (
                                <div className="extinct-message">
                                    池のメダカは絶滅してしまいました…
                                </div>
                            ) : (
                                <div className="fishes-container">
                                    {fishes.map((fish) => {
                                        const p = getPhenotype(fish.genotype);
                                        // ランダムな位置に配置
                                        const style = {
                                            top: `${Math.random() * 80 + 10}%`,
                                            left: `${Math.random() * 80 + 10}%`,
                                            animationDuration: `${Math.random() * 3 + 4}s`,
                                            animationDelay: `${Math.random() * 2}s`
                                        };
                                        return (
                                            <div
                                                key={fish.id}
                                                className={`fish-icon ${p.color}`}
                                                style={style}
                                                title={`年齢:${fish.age} 遺伝子:${fish.genotype}`}
                                            >
                                                <span className="genotype-label">{fish.genotype}{fish.age}</span>
                                                <img
                                                    src={p.imgs[Math.floor(Math.random() * p.imgs.length)]}
                                                    alt={p.label}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="controls">
                        <button
                            className="next-gen-btn"
                            onClick={nextGeneration}
                            disabled={fishes.length === 0 || transitionStats !== null}
                        >
                            次の世代へ進める（1年経過）
                        </button>

                        <div className="control-options">
                            <label className="toggle-label">
                                <input
                                    type="checkbox"
                                    checked={showTransitionOverlay}
                                    onChange={(e) => setShowTransitionOverlay(e.target.checked)}
                                />
                                世代交代の結果画面を表示する
                            </label>
                            {generation > 0 && <button className="reset-btn" onClick={() => setGameState('SETUP')}>最初からやり直す</button>}
                        </div>
                    </div>

                    <div className="history-graph">
                        <h3>グラフ（推移）</h3>
                        <div className="graph-legend">
                            <span className="legend-item"><span className="legend-color wild-color"></span> 野生 (AA)</span>
                            <span className="legend-item"><span className="legend-color hybrid-color"></span> 交雑 (Aa)</span>
                            <span className="legend-item"><span className="legend-color domestic-color"></span> 改良 (aa)</span>
                        </div>
                        <div className="bars-container">
                            {history.map((h, i) => {
                                const maxItems = Math.max(...history.map(item => item.total), INITIAL_POND_CAPACITY + 50, 1);
                                const pHeight = (h.pureWild / maxItems) * 100;
                                const hHeight = (h.hybrid / maxItems) * 100;
                                const dHeight = (h.domestic / maxItems) * 100;
                                return (
                                    <div key={i} className="bar-group" title={`第${h.generation}世代:\n野生: ${h.pureWild}匹\n交雑: ${h.hybrid}匹\n改良: ${h.domestic}匹\n(計${h.total}匹)`}>
                                        <div className="bar-stack">
                                            <div className="bar d-bar" style={{ height: `${dHeight}%` }}></div>
                                            <div className="bar h-bar" style={{ height: `${hHeight}%` }}></div>
                                            <div className="bar w-bar" style={{ height: `${pHeight}%` }}></div>
                                        </div>
                                        <span className="bar-label">{h.generation}</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}



