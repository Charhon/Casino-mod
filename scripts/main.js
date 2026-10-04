// ===== КАЗИНО для Mindustry v8 (build 160.x) =====
// Кладёшь предметы в казино, выбираешь ставку и приз.
// Шанс = ценность ставки / ценность приза * HOUSE_EDGE.

// ---------- НАСТРОЙКИ (можно менять) ----------
const HOUSE_EDGE = 0.90;  // казино оставляет себе 10%
const MAX_CHANCE = 0.95;  // шанс никогда не выше 95%
const MIN_CHANCE = 0.01;  // ниже 1% играть нельзя (защита от обмана)
const MAX_AMOUNT = 500;   // максимум предметов в ставке/призе
const COPPER_COST = 25;   // цена постройки казино (медь)

// Ценность одного предмета. Неизвестные (из других модов) считаются по item.cost
const VALUES = {
    "scrap": 0.4, "sand": 0.4, "copper": 1, "lead": 1.3, "coal": 1.2,
    "graphite": 2, "metaglass": 2.5, "silicon": 2.5, "titanium": 3.5,
    "spore-pod": 3, "pyratite": 4, "blast-compound": 5, "thorium": 6,
    "plastanium": 9, "phase-fabric": 11, "surge-alloy": 12,
    "beryllium": 3, "tungsten": 5, "oxide": 7, "carbide": 10,
    "dormant-cyst": 8, "fissile-matter": 12
};

let loadError = null;

function itemValue(item) {
    const v = VALUES[item.name];
    if (v !== undefined) return v;
    return item.cost > 0 ? item.cost * 2 : 1;
}

function chanceOf(bet, betAmt, prize, prizeAmt) {
    const stake = itemValue(bet) * betAmt;
    const reward = itemValue(prize) * prizeAmt;
    return Math.min(MAX_CHANCE, stake / reward * HOUSE_EDGE);
}

function pct(p) { return (Math.floor(p * 10000) / 100).toFixed(2) + "%"; }
function clampAmount(n) { return Math.max(1, Math.min(MAX_AMOUNT, n)); }

// Все действия идут одним числом: param * 8 + action (так работает и в мультиплеере)
// action: 0 = предмет ставки, 1 = предмет приза, 2 = кол-во ставки, 3 = кол-во приза, 4 = играть (param = бросок 0..9999)
function cmd(action, param) { return Packages.java.lang.Integer.valueOf(param * 8 + action); }

function usable(item) {
    try { return item.unlockedNow(); } catch (e) { return true; }
}

try {
    // ---------- БЛОК ----------
    const casino = extend(Block, "casino", {
        // переопределяем свойства если нужно
    });
    casino.localizedName = "Казино";
    casino.description = "Ставь одни предметы на другие!\nШанс зависит от ценности ставки и приза.\nПоложи ставку в блок (конвейером или из инвентаря), тапни по блоку и жми ИГРАТЬ.";
    casino.size = 2;
    casino.health = 400;
    casino.solid = true;
    casino.update = true;
    casino.destructible = true;
    casino.hasItems = true;
    casino.itemCapacity = 1000;
    casino.configurable = true;
    casino.alwaysUnlocked = true;
    casino.buildVisibility = BuildVisibility.shown;

    // Вот правильный способ задать цену в JS для Mindustry:
    casino.category = Category.logic;
    casino.requirements = ItemStack.with(Items.copper, COPPER_COST);

    // v8: на какой планете показывать блок
    try { casino.shownPlanets.add(Planets.serpulo); } catch (e) {}

    casino.buildType = () => {
        // состояние каждого казино
        let betItem = Items.copper;
        let prizeItem = Items.lead;
        let betAmount = 10;
        let prizeAmount = 10;
        let lastResult = "[lightgray]Ещё не играли";

        function chance() { return chanceOf(betItem, betAmount, prizeItem, prizeAmount); }

        // null = играть можно, иначе текст причины
        function problem(b) {
            if (betItem.id == prizeItem.id) return "Выбери РАЗНЫЕ предметы";
            if (chance() < MIN_CHANCE) return "Шанс меньше 1%: уменьши приз или увеличь ставку";
            if (!b.items.has(betItem, betAmount)) {
                return "Положи в казино ставку: " + betAmount + " " + betItem.localizedName + " (сейчас " + b.items.get(betItem) + ")";
            }
            if (b.items.get(prizeItem) + prizeAmount > casino.itemCapacity) return "Нет места для приза: забери предметы из казино";
            return null;
        }

        function itemGrid(g, b, getItem, action) {
            let i = 0;
            Vars.content.items().each(item => {
                if (!usable(item) || item.uiIcon == null) return;
                const btn = g.button(new TextureRegionDrawable(item.uiIcon), Styles.clearTogglei, 32, () => {
                    b.configure(cmd(action, item.id));
                }).size(48).pad(2).get();
                btn.update(() => btn.setChecked(getItem().id == item.id));
                if (++i % 6 == 0) g.row();
            });
        }

        function amountRow(a, b, getAmt, action) {
            [-100, -10, -1].forEach(d => {
                a.button(String(d), () => b.configure(cmd(action, clampAmount(getAmt() + d)))).size(54, 44);
            });
            a.label(() => "  " + getAmt() + "  ").width(70);
            [1, 10, 100].forEach(d => {
                a.button("+" + d, () => b.configure(cmd(action, clampAmount(getAmt() + d)))).size(54, 44);
            });
        }

        function openDialog(b) {
            const d = new BaseDialog("Казино");
            d.addCloseButton();
            d.cont.pane(t => {
                t.defaults().pad(4);

                t.add("[accent]СТАВКА - что отдаёшь[]").row();
                t.label(() => betAmount + " x " + betItem.localizedName + "  [lightgray](в казино: " + b.items.get(betItem) + ")").row();
                const betGrid = new Table();
                itemGrid(betGrid, b, () => betItem, 0);
                t.add(betGrid).row();
                const betAmounts = new Table();
                amountRow(betAmounts, b, () => betAmount, 2);
                t.add(betAmounts).row();

                t.add("[accent]ПРИЗ - что хочешь получить[]").row();
                t.label(() => prizeAmount + " x " + prizeItem.localizedName + "  [lightgray](в казино: " + b.items.get(prizeItem) + ")").row();
                const prizeGrid = new Table();
                itemGrid(prizeGrid, b, () => prizeItem, 1);
                t.add(prizeGrid).row();
                const prizeAmounts = new Table();
                amountRow(prizeAmounts, b, () => prizeAmount, 3);
                t.add(prizeAmounts).row();

                t.label(() => "[accent]Шанс выигрыша: " + pct(chance()) + "[]").row();
                t.label(() => "[lightgray]Ценность 1 шт: " + betItem.localizedName + " = " + itemValue(betItem) + ", " + prizeItem.localizedName + " = " + itemValue(prizeItem) + "[]").row();
                t.label(() => "[lightgray]Шанс = ценность ставки / ценность приза x " + HOUSE_EDGE + " (макс 95%, мин 1%)[]").row();

                t.label(() => {
                    const p = problem(b);
                    return p != null ? "[scarlet]" + p : "[green]Всё готово - можно играть!";
                }).row();

                const play = t.button("[accent]ИГРАТЬ", () => {
                    if (problem(b) != null) return;
                    b.configure(cmd(4, Math.floor(Math.random() * 10000)));
                }).size(240, 60).get();
                play.update(() => play.setDisabled(problem(b) != null));
                t.row();

                t.label(() => "Последний результат: " + lastResult).row();
            }).grow();
            d.show();
        }

        return extend(Building, {
            // принимаем любые предметы (конвейеры, игрок)
            acceptItem(source, item) {
                return this.items.get(item) < casino.itemCapacity;
            },

            buildConfiguration(table) {
                const b = this;
                table.button("[accent]Открыть казино", () => openDialog(b)).size(210, 50).row();
                table.label(() => betAmount + " " + betItem.localizedName + " на " + prizeAmount + " " + prizeItem.localizedName + "  (" + pct(chance()) + ")").pad(6);
            },

            configured(builder, value) {
                const code = parseInt(String(value));
                if (isNaN(code) || code < 0) return;
                const action = code % 8;
                const param = Math.floor(code / 8);

                if (action == 0 || action == 1) {
                    const it = Vars.content.item(param);
                    if (it == null) return;
                    if (action == 0) betItem = it; else prizeItem = it;
                } else if (action == 2) {
                    betAmount = clampAmount(param);
                } else if (action == 3) {
                    prizeAmount = clampAmount(param);
                } else if (action == 4) {
                    if (problem(this) != null) return;
                    const win = param < Math.floor(chance() * 10000);
                    const bi = betItem, pi = prizeItem, ba = betAmount, pa = prizeAmount;
                    this.items.remove(bi, ba);
                    let msg;
                    if (win) {
                        this.items.add(pi, pa);
                        msg = "[green]ВЫИГРЫШ![] +" + pa + " " + pi.localizedName;
                    } else {
                        msg = "[scarlet]Проигрыш[] -" + ba + " " + bi.localizedName;
                    }
                    lastResult = msg;
                    try {
                        Fx.healBlockFull.at(this.x, this.y, 0, win ? Pal.heal : Pal.remove, casino);
                        if (win) Sounds.unlock.at(this.x, this.y);
                    } catch (e) {}
                    // v8: player.unit() может быть null, поэтому проверяем dead()
                    if (!Vars.headless && builder != null && !Vars.player.dead() && builder == Vars.player.unit()) {
                        Vars.ui.showInfoToast(msg, 2.5);
                    }
                }
            },

            write(write) {
                this.super$write(write);
                write.s(betItem.id);
                write.s(prizeItem.id);
                write.i(betAmount);
                write.i(prizeAmount);
            },

            read(read, revision) {
                this.super$read(read, revision);
                const bi = Vars.content.item(read.s());
                const pi = Vars.content.item(read.s());
                betItem = bi != null ? bi : Items.copper;
                prizeItem = pi != null ? pi : Items.lead;
                betAmount = clampAmount(read.i());
                prizeAmount = clampAmount(read.i());
            }
        });
    };
} catch (e) {
    loadError = String(e) + (e.lineNumber ? " (строка " + e.lineNumber + ")" : "");
}

// Сообщение при запуске игры: сразу видно, загрузился ли мод
Events.on(ClientLoadEvent, () => {
    if (loadError != null) {
        Vars.ui.showErrorMessage("[scarlet]Казино: ошибка загрузки[]\n\n" + loadError);
    } else {
        Vars.ui.showInfoToast("[accent]Казино загружено! Ищи блок в категории Логика", 4);
    }
});
