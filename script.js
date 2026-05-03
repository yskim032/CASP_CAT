/**
 * Premium EDI Bayplan Simulator Logic
 */

const ISO_TYPE_MAPPING = {
    // 20FT Containers
    "2200": "20DV", "2210": "20DV", "22G0": "20DV", "22G1": "20DV",
    "22T0": "20TK", "22T1": "20TK",
    "2232": "20RE", "22R0": "20RE", "22R1": "20RE",
    "22P1": "20FL", "22P0": "20FL",
    "22U1": "20OT", "22U0": "20OT",
    "22H0": "20HQ", "22H1": "20HQ",
    "22B0": "20BK", "22B1": "20BK",
    "2250": "20RF",
    "22GP": "20GP", "22PC": "20FR", "22UT": "20OT",

    // 40FT Containers
    "42G0": "40DV", "4310": "40DV", "42G1": "40DV",
    "45G0": "40HC", "4510": "40HC", "45G1": "40HC",
    "45R0": "40HR", "4532": "40HR", "45R1": "40HR",
    "42P1": "40FL", "4363": "40FL", "42P0": "40FL",
    "42U1": "40OT", "42U0": "40OT",
    "4232": "40RE", "42R0": "40RE",
    "42T0": "40TK", "42T1": "40TK",
    "4563": "40HF",
    "42B0": "40BK",
    "40GP": "40GP", "40PC": "40FR", "40UT": "40OT", "43GP": "40HC",

    // 45FT Containers
    "9400": "45HC", "L5G0": "45HC",
    "L5G1": "45HC", "95G0": "45HC",
    "45GP": "45HC", "45PC": "45FR", "45UT": "45OT",

    // Special Equipment
    "GENE": "GE", "VENT": "VT", "CONT": "CT", "CRYO": "CY",
    "HCFR": "HRF", "PCHP": "HP", "REOT": "RO", "TKOT": "TO",
    "PCOT": "PO", "FLOT": "FO", "SKEL": "SK", "FRMG": "FG", "BULD": "BD",
    "LIVS": "LS", "VEHI": "VH", "PIPE": "PP", "LOGS": "LG", "DANG": "DG",
    "EXPL": "EX", "RADIO": "RD", "OXID": "OX", "CORR": "CR", "MISC": "MC",
    "20HC": "20HC", "40PW": "40PW", "45PW": "45PW",
    "20RF": "20RF", "40RF": "40RF", "45RF": "45RF",
    "20TN": "20TN", "40TN": "40TN",
    "20PL": "20PL", "40PL": "40PL", "45PL": "45PL",
    "20OS": "20OS", "40OS": "40OS",
    "20VN": "20VN", "40VN": "40VN",
    "20SS": "20SS", "40SS": "40SS",
    "20HT": "20HT", "40HT": "40HT",
    "20OT": "20OT", "40OT": "40OT",
    "40HF": "40HF", "40HO": "40HO", "45OT": "45OT"
};

class BayplanSimulator {
    constructor() {
        this.disContainers = [];
        this.lodContainers = [];
        this.combinedContainers = [];
        this.vessel = "---";
        this.voyage = "---";
        this.gcCount = 3;
        this.targetPort = "KRPUS";
        this.viewMode = "combined"; // combined, dis, lod

        this.initEventListeners();
    }

    initEventListeners() {
        // Drag and Drop
        this.setupDropZone('dropZoneDis', (data) => {
            this.disContainers = this.parseEDI(data);
            this.updateUI();
        }, 'fileNameDis');

        this.setupDropZone('dropZoneLod', (data) => {
            this.lodContainers = this.parseEDI(data);
            this.updateUI();
        }, 'fileNameLod');

        // GC Count listener removed since simulation view was removed.

        // Port change
        document.getElementById('targetPort').addEventListener('change', (e) => {
            this.targetPort = e.target.value;
            this.updateUI();
        });

        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                const tabName = tab.getAttribute('data-tab');
                document.querySelectorAll('.view-container').forEach(v => v.classList.add('hidden'));
                document.getElementById(`${tabName}View`).classList.remove('hidden');
                if (tabName === 'list') this.switchListTab(this.currentListTab || 'dis');
            });
        });

        // View Mode buttons
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.viewMode = btn.getAttribute('data-view');
                this.renderGeneralStowage();
            });
        });

        // Modal close
        document.getElementById('closeModal').addEventListener('click', () => {
            document.getElementById('bayModal').classList.add('hidden');
        });

        // Simulation Calculation listeners
        ['calcProd', 'calcGang', 'calcTargetBerth'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => this.updateSimulationCalc());
            }
        });

        // Zoom functionality
        document.getElementById('zoomSlider').addEventListener('input', (e) => {
            const scale = e.target.value / 100;
            this.applyZoom(scale);
        });

        document.getElementById('zoomDefaultBtn').addEventListener('click', () => {
            if (this.autoScale) {
                this.applyZoom(this.autoScale);
                document.getElementById('zoomSlider').value = Math.round(this.autoScale * 100);
            }
        });

        document.getElementById('zoomPercent').addEventListener('click', () => {
            if (this.autoScale) {
                this.applyZoom(this.autoScale);
                document.getElementById('zoomSlider').value = Math.round(this.autoScale * 100);
            }
        });

        // Keyboard navigation for Modal
        document.addEventListener('keydown', (e) => {
            const modal = document.getElementById('bayModal');
            if (modal.classList.contains('hidden')) return;

            if (e.key === 'ArrowLeft') {
                this.navigateBay(-1);
            } else if (e.key === 'ArrowRight') {
                this.navigateBay(1);
            } else if (e.key === 'Escape') {
                modal.classList.add('hidden');
            }
        });
    }

    loadDemoData() {
        // DIS: Discharge plan - containers on board, heading to Korea
        this.disContainers = [
            { pos: '220102', id: 'HDMU1000001', type: '22G1', size: 20, port: 'KRPUS', isRestow: false },
            { pos: '220104', id: 'HDMU1000002', type: '22G1', size: 20, port: 'KRPUS', isRestow: false },
            { pos: '220106', id: 'HDMU1000003', type: '22G1', size: 20, port: 'KRKAN', isRestow: false },
            { pos: '220108', id: 'HDMU1000004', type: '22G1', size: 20, port: 'KRKAN', isRestow: false },
            { pos: '220302', id: 'HDMU1000005', type: '22G1', size: 20, port: 'KRINC', isRestow: false },
            { pos: '220304', id: 'HDMU1000006', type: '22G1', size: 20, port: 'KRPUS', isRestow: false },
            { pos: '221170', id: 'HDMU1000007', type: '22G1', size: 20, port: 'KRPUS', isRestow: false },
            { pos: '221172', id: 'HDMU1000008', type: '22G1', size: 20, port: 'KRPUS', isRestow: false },
            { pos: '221174', id: 'HDMU1000009', type: '22G1', size: 20, port: 'KRINC', isRestow: false },
            { pos: '221176', id: 'HDMU1000010', type: '22G1', size: 20, port: 'KRPUS', isRestow: false },
            { pos: '221370', id: 'HDMU1000011', type: '22G1', size: 20, port: 'KRPUS', isRestow: false },
            { pos: '221372', id: 'HDMU1000012', type: '22G1', size: 20, port: 'KRKAN', isRestow: false },
            { pos: '300202', id: 'HDMU2000001', type: '45G1', size: 40, port: 'KRPUS', isRestow: false },
            { pos: '300204', id: 'HDMU2000002', type: '45G1', size: 40, port: 'KRPUS', isRestow: false },
            { pos: '300402', id: 'HDMU2000003', type: '45G1', size: 40, port: 'KRKAN', isRestow: false },
            { pos: '301170', id: 'HDMU2000004', type: '45G1', size: 40, port: 'KRPUS', isRestow: false },
            { pos: '301172', id: 'HDMU2000005', type: '45G1', size: 40, port: 'KRPUS', isRestow: false },
            { pos: '301370', id: 'HDMU2000006', type: '22G1', size: 20, port: 'KRINC', isRestow: false },
            { pos: '500102', id: 'HDMU3000001', type: '22G1', size: 20, port: 'KRPUS', isRestow: false },
            { pos: '500104', id: 'HDMU3000002', type: '22G1', size: 20, port: 'KRPUS', isRestow: false },
            { pos: '500502', id: 'HDMU3000003', type: '22G1', size: 20, port: 'KRKAN', isRestow: false },
            { pos: '500504', id: 'HDMU3000004', type: '22G1', size: 20, port: 'KRKAN', isRestow: false },
            { pos: '501170', id: 'HDMU3000005', type: '22G1', size: 20, port: 'KRPUS', isRestow: false },
            { pos: '501172', id: 'HDMU3000006', type: '22G1', size: 20, port: 'KRINC', isRestow: false },
            { pos: '700202', id: 'HDMU4000001', type: '45G1', size: 40, port: 'KRPUS', isRestow: false },
            { pos: '700204', id: 'HDMU4000002', type: '45G1', size: 40, port: 'KRPUS', isRestow: false },
            { pos: '700402', id: 'HDMU4000003', type: '45G1', size: 40, port: 'KRKAN', isRestow: false },
            { pos: '700404', id: 'HDMU4000004', type: '45G1', size: 40, port: 'KRINC', isRestow: false },
            { pos: '701170', id: 'HDMU4000005', type: '22G1', size: 20, port: 'KRPUS', isRestow: false },
            { pos: '701370', id: 'HDMU4000006', type: '22G1', size: 20, port: 'KRPUS', isRestow: false },
        ];
        // LOD: Load plan - containers being loaded at Korea
        this.lodContainers = [
            { pos: '220108', id: 'MSCU5000001', type: '22G1', size: 20, port: 'KRPUS', isRestow: false },
            { pos: '220110', id: 'MSCU5000002', type: '22G1', size: 20, port: 'KRPUS', isRestow: false },
            { pos: '221176', id: 'HDMU1000010', type: '22G1', size: 20, port: 'KRPUS', isRestow: true },
            { pos: '221270', id: 'MSCU5000003', type: '45G1', size: 40, port: 'KRPUS', isRestow: false },
            { pos: '221272', id: 'MSCU5000004', type: '45G1', size: 40, port: 'KRPUS', isRestow: false },
            { pos: '460102', id: 'MSCU6000001', type: '22G1', size: 20, port: 'KRPUS', isRestow: false },
            { pos: '460104', id: 'MSCU6000002', type: '22G1', size: 20, port: 'KRPUS', isRestow: false },
            { pos: '460302', id: 'MSCU6000003', type: '22G1', size: 20, port: 'KRPUS', isRestow: false },
            { pos: '460304', id: 'MSCU6000004', type: '22G1', size: 20, port: 'KRPUS', isRestow: false },
            { pos: '461170', id: 'MSCU6000005', type: '45G1', size: 40, port: 'KRPUS', isRestow: false },
            { pos: '461172', id: 'MSCU6000006', type: '45G1', size: 40, port: 'KRPUS', isRestow: false },
            { pos: '700202', id: 'HDMU4000001', type: '45G1', size: 40, port: 'KRPUS', isRestow: true },
            { pos: '700620', id: 'MSCU7000001', type: '22G1', size: 20, port: 'KRPUS', isRestow: false },
            { pos: '700622', id: 'MSCU7000002', type: '22G1', size: 20, port: 'KRPUS', isRestow: false },
            { pos: '701170', id: 'MSCU7000003', type: '45G1', size: 40, port: 'KRPUS', isRestow: false },
        ];
        this.vessel = "MSC GULSUN";
        this.voyage = "FY618A";
        document.getElementById('vesselInfo').textContent = `${this.vessel} / ${this.voyage}`;
        this.updateUI();
    }


    setupDropZone(id, callback, fileNameId) {
        const zone = document.getElementById(id);
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('active');
        });
        zone.addEventListener('dragleave', () => {
            zone.classList.remove('active');
        });
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('active');
            const file = e.dataTransfer.files[0];
            if (file) {
                document.getElementById(fileNameId).textContent = file.name;
                const reader = new FileReader();
                reader.onload = (event) => callback(event.target.result);
                reader.readAsText(file);
            }
        });
    }

    parseEDI(content) {
        // Strip ALL whitespace variations (\r \n \t) then split on segment terminator '
        const segments = content.replace(/[\r\n\t]/g, '').split("'");
        const containers = [];
        let currentContainer = null;
        let vessel = "";
        let voyage = "";

        segments.forEach(rawSeg => {
            const seg = rawSeg.trim();
            if (!seg) return;

            const parts = seg.split('+');
            const tag = parts[0].trim();

            // ──────────────────────────────────────────────
            // TDT: Vessel / Voyage info
            // ──────────────────────────────────────────────
            if (tag === 'TDT') {
                voyage = (parts[2] || '').trim();
                // Vessel name often after "::" in one of the fields
                const match = seg.match(/::([^+:]+)/);
                if (match) vessel = match[1].trim();
                this.vessel = vessel;
                this.voyage = voyage;
                document.getElementById('vesselInfo').textContent =
                    `${vessel || '---'} / ${voyage || '---'}`;
            }

            // ──────────────────────────────────────────────
            // LOC+147: container stowage position
            // LOC+9 : port of loading
            // LOC+11: port of discharge
            // ──────────────────────────────────────────────
            if (tag === 'LOC') {
                const locType = (parts[1] || '').trim();

                if (locType === '147') {
                    // Save previous container before starting a new one
                    if (currentContainer) containers.push(currentContainer);

                    const rawPos = (parts[2] || '').split(':')[0].trim();
                    // Take last 6 chars: "0221176" → "221176"
                    const pos = rawPos.length > 6 ? rawPos.slice(-6) : rawPos.padStart(6, '0');

                    currentContainer = {
                        pos,
                        id: '',
                        type: '',
                        size: 20,
                        port: '',
                        pol: '',   // LOC+9  port of loading
                        pod: '',   // LOC+11 port of discharge
                        fullEmpty: '?',
                        weight: null,
                        temp: null,
                        dg: null,
                        isRestow: false
                    };

                } else if (locType === '9') {
                    if (currentContainer) {
                        const portCode = (parts[2] || '').split(':')[0].trim();
                        currentContainer.pol = portCode;
                        const krPorts = ['KRPUS', 'KRKAN', 'KRINC'];
                        if (krPorts.includes(portCode)) currentContainer.port = portCode;
                        else if (!currentContainer.port) currentContainer.port = portCode;
                    }
                } else if (locType === '11') {
                    if (currentContainer) {
                        currentContainer.pod = (parts[2] || '').split(':')[0].trim();
                    }
                }
            }

            // ──────────────────────────────────────────────
            // EQD: Equipment (container ID + ISO type)
            // EQD+CN+UETU6065823+45G0+++5
            // ──────────────────────────────────────────────
            if (tag === 'EQD' && currentContainer) {
                currentContainer.id = (parts[2] || '').trim();
                const typeCode = (parts[3] || '').split(':')[0].trim();
                currentContainer.type = typeCode;
                if (typeCode.startsWith('2')) currentContainer.size = 20;
                else if (typeCode.startsWith('L') || typeCode.startsWith('l')) currentContainer.size = 45;
                else currentContainer.size = 40;
                // Last element: 5 = Full, 4 = Empty
                const last = (parts[parts.length - 1] || '').trim();
                currentContainer.fullEmpty = last === '5' ? 'F' : last === '4' ? 'E' : '?';
            }

            // MEA+VGM++KGM:34200  → weight in tons
            if (tag === 'MEA' && currentContainer && (parts[1] || '') === 'VGM') {
                const wgtStr = ((parts[3] || '').split(':')[1] || '').trim();
                if (wgtStr) currentContainer.weight = (parseFloat(wgtStr) / 1000).toFixed(1);
            }

            // TMP+2+-25.0:CEL  → reefer temperature
            if (tag === 'TMP' && currentContainer) {
                const tempStr = ((parts[2] || '').split(':')[0]).trim();
                if (tempStr) currentContainer.temp = tempStr;
            }

            // DGS+IMD+9+3082+...  → dangerous goods class/UN
            if (tag === 'DGS' && currentContainer) {
                const cls = (parts[2] || '').trim();
                const un = (parts[3] || '').trim();
                if (cls || un) currentContainer.dg = [cls, un].filter(Boolean).join('/');
            }
        });

        // Push the last container
        if (currentContainer) containers.push(currentContainer);

        // Return everything that has a valid 6-digit position
        const valid = containers.filter(c => c.pos && c.pos.length === 6 && /^\d{6}$/.test(c.pos));
        console.log(`[parseEDI] total segments: ${segments.length}, containers found: ${containers.length}, valid: ${valid.length}`);
        return valid;
    }

    updateUI() {
        this.processRestows();
        this.renderGeneralStowage();
        this.renderRecap();
        this.refreshSimulation();
    }

    processRestows() {
        // Find containers present in both DIS and LOD with CHANGED positions
        const disMap = new Map(this.disContainers.map(c => [c.id, c]));
        const lodMap = new Map(this.lodContainers.map(c => [c.id, c]));

        this.disContainers.forEach(c => {
            const lodC = lodMap.get(c.id);
            if (lodC && lodC.pos !== c.pos) c.isRestow = true;
        });

        this.lodContainers.forEach(c => {
            const disC = disMap.get(c.id);
            if (disC && disC.pos !== c.pos) c.isRestow = true;
        });
    }

    getBays() {
        const bays = new Set();
        const containers = this.getAllVisibleContainers();
        containers.forEach(c => bays.add(c.pos.substring(0, 2)));
        // ASCENDING order: 01, 02, 03, 05, 06, 07 ... (bow to stern)
        return Array.from(bays).sort((a, b) => parseInt(a) - parseInt(b));
    }

    renderGeneralStowage() {
        const container = document.getElementById('generalStowageGrid');
        container.innerHTML = '';

        const bays = this.getBays();
        if (bays.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary);">Upload EDI files to begin.</p>';
            return;
        }

        const bayNums = bays.map(b => parseInt(b));
        const maxBay = Math.max(...bayNums);
        const existingNums = new Set(bayNums);

        this.bayGroupsForNavigation = [];

        // Maritime grouping: (b1=FWD 20', b2=40' center, b3=AFT 20')
        // k=1 -> (01,02,03); k=2 -> (05,06,07); ...
        // In general view:
        //   - b1 (FWD 20') -> own thumb
        //   - b2 (40') + b3 (AFT 20') -> ONE combined thumb (they share the same slot visually)
        // In detailed view: b2 and b3 are shown as separate grids side by side
        for (let k = 1; k <= 60; k++) {
            const b1 = 4 * k - 3; // FWD 20' odd
            const b2 = 4 * k - 2; // 40' even
            const b3 = 4 * k - 1; // AFT 20' odd

            if (b1 > maxBay + 4) break;
            const hasAny = existingNums.has(b1) || existingNums.has(b2) || existingNums.has(b3);
            if (!hasAny) continue;

            const hatchDiv = document.createElement('div');
            hatchDiv.className = 'hatch-column';

            // ── FWD 20' bay (b1) ── own thumbnail
            if (existingNums.has(b1)) {
                const s1 = b1.toString().padStart(2, '0');
                this.bayGroupsForNavigation.push([s1]);

                const bayDiv = document.createElement('div');
                bayDiv.className = 'bay-thumb';
                bayDiv.innerHTML = `<header>BAY ${s1}</header>`;
                const canvas = document.createElement('canvas');
                canvas.width = 400; canvas.height = 530;
                this.drawMiniBayMulti(canvas, [s1]);
                bayDiv.appendChild(canvas);
                bayDiv.addEventListener('click', () => this.openDetailedBayGroup([s1]));
                hatchDiv.appendChild(bayDiv);
            }

            // ── 40' bay (b2) + AFT 20' bay (b3) ── merged into ONE thumbnail
            const hasCombined = existingNums.has(b2) || existingNums.has(b3);
            if (hasCombined) {
                const s2 = b2.toString().padStart(2, '0');
                const s3 = b3.toString().padStart(2, '0');
                const codes = [];
                if (existingNums.has(b2)) codes.push(s2);
                if (existingNums.has(b3)) codes.push(s3);

                const label = codes.length === 2
                    ? `BAY ${s2}(40') / ${s3}`
                    : `BAY ${codes[0]}${existingNums.has(b2) ? "(40')" : ''}`;

                this.bayGroupsForNavigation.push(codes);

                const bayDiv = document.createElement('div');
                bayDiv.className = 'bay-thumb bay-40';
                bayDiv.innerHTML = `<header>${label}</header>`;
                const canvas = document.createElement('canvas');
                canvas.width = 400; canvas.height = 530;
                this.drawMiniBayMulti(canvas, codes);
                bayDiv.appendChild(canvas);
                bayDiv.addEventListener('click', () => this.openDetailedBayGroup(codes));
                hatchDiv.appendChild(bayDiv);
            }

            if (hatchDiv.children.length > 0) container.appendChild(hatchDiv);
        }
    }

    drawMiniBayMulti(canvas, bayCodes) {
        const ctx = canvas.getContext('2d');
        const all = this.getAllVisibleContainers();
        const containers = all.filter(c => bayCodes.includes(c.pos.substring(0, 2)));

        const gridW = 30, gridH = 25;
        const cellW = canvas.width / gridW;
        const cellH = (canvas.height / 2) / gridH;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 0.5;
        for (let x = 0; x <= gridW; x++) {
            ctx.beginPath(); ctx.moveTo(x * cellW, 0); ctx.lineTo(x * cellW, canvas.height); ctx.stroke();
        }
        for (let y = 0; y <= gridH * 2; y++) {
            ctx.beginPath(); ctx.moveTo(0, y * cellH); ctx.lineTo(canvas.width, y * cellH); ctx.stroke();
        }
        ctx.fillStyle = '#000';
        ctx.fillRect(0, canvas.height / 2 - 2, canvas.width, 4);

        const gridMap = new Map();
        containers.forEach(c => {
            const row = parseInt(c.pos.substring(2, 4));
            const tier = parseInt(c.pos.substring(4, 6));
            const rIdx = this.getRowIdx(row);
            const isOnDeck = tier >= 70;
            const tIdx = this.getTierIdx(tier, isOnDeck);

            if (rIdx >= 0 && rIdx < gridW && tIdx >= 0 && tIdx < gridH) {
                const key = `${rIdx}-${isOnDeck}-${tIdx}`;
                if (!gridMap.has(key)) gridMap.set(key, []);
                gridMap.get(key).push(c);
            }
        });

        gridMap.forEach((occupants, key) => {
            const parts = key.split('-');
            const rIdx = parseInt(parts[0]);
            const isOnDeck = parts[1] === 'true';
            const tIdx = parseInt(parts[2]);

            const x = rIdx * cellW;
            const y = isOnDeck ? (gridH - 1 - tIdx) * cellH : (gridH * 2 - 1 - tIdx) * cellH;

            if (occupants.length === 1 || this.viewMode !== 'combined') {
                const c = occupants[0];
                const color = this.getColorForContainer(c);
                const bayInt = parseInt(c.pos.substring(0, 2));

                ctx.fillStyle = color;
                if (bayInt % 2 !== 0) {
                    if (bayInt % 4 === 1) {
                        // FWD 20' -> Top Left Triangle
                        ctx.beginPath();
                        ctx.moveTo(x + 0.5, y + 0.5);
                        ctx.lineTo(x + 0.5 + cellW - 1, y + 0.5);
                        ctx.lineTo(x + 0.5, y + 0.5 + cellH - 1);
                        ctx.fill();
                    } else {
                        // AFT 20' -> Bottom Right Triangle
                        ctx.beginPath();
                        ctx.moveTo(x + 0.5 + cellW - 1, y + 0.5);
                        ctx.lineTo(x + 0.5 + cellW - 1, y + 0.5 + cellH - 1);
                        ctx.lineTo(x + 0.5, y + 0.5 + cellH - 1);
                        ctx.fill();
                    }
                } else {
                    // 40' -> Full Square
                    ctx.fillRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
                }
            } else {
                // Shared slot (Combined overlap)
                const color1 = this.getColorForContainer(occupants[0]);
                const color2 = this.getColorForContainer(occupants[1]);

                ctx.fillStyle = color1;
                ctx.beginPath();
                ctx.moveTo(x + 0.5, y + 0.5);
                ctx.lineTo(x + 0.5 + cellW - 1, y + 0.5);
                ctx.lineTo(x + 0.5, y + 0.5 + cellH - 1);
                ctx.fill();

                ctx.fillStyle = color2;
                ctx.beginPath();
                ctx.moveTo(x + 0.5 + cellW - 1, y + 0.5);
                ctx.lineTo(x + 0.5 + cellW - 1, y + 0.5 + cellH - 1);
                ctx.lineTo(x + 0.5, y + 0.5 + cellH - 1);
                ctx.fill();
            }
        });
    }


    drawMiniBay(canvas, bayCode) {
        this.drawMiniBayMulti(canvas, [bayCode]);
    }

    getRowIdx(row) {
        // Center 01 -> 15. Even (Left) 02, 04 -> 14, 13. Odd (Right) 03, 05 -> 16, 17
        if (row === 1) return 15;
        if (row % 2 === 0) return 15 - (row / 2);
        return 15 + Math.floor(row / 2);
    }

    getTierIdx(tier, isOnDeck) {
        if (isOnDeck) return Math.floor((tier - 70) / 2);
        return Math.floor((tier - 2) / 2);
    }

    getLoadColor(portCode) {
        if (portCode === 'KRKAN') return '#3b82f6'; // Blue
        if (portCode === 'KRINC') return '#a855f7'; // Purple
        return '#22c55e'; // Green for KRPUS
    }

    getColorForContainer(c) {
        const pol = c.pol || c.port; // Fallback to c.port for Demo Data
        const pod = c.pod || c.port;
        const loadColor = this.getLoadColor(this.targetPort);

        // In LOD view: Only show target port loading. Rest are gray.
        if (this.viewMode === 'lod') {
            if (pol === this.targetPort) return loadColor;
            return '#475569'; // Gray
        }

        // In DIS view: Only show target port discharging (Amber). Rest are gray.
        if (this.viewMode === 'dis') {
            if (pod === this.targetPort) return '#f59e0b'; // Amber
            return '#475569'; // Gray
        }

        // In Combined view
        if (c.isRestow) return '#ec4899'; // Pink
        if (pol === this.targetPort) return loadColor; // Dynamic Load Color
        if (pod === this.targetPort) return '#f59e0b'; // Amber (Discharge)

        return '#475569'; // Gray fallback
    }


    getAllVisibleContainers() {
        if (this.viewMode === 'dis') return this.disContainers;
        if (this.viewMode === 'lod') return this.lodContainers;

        // Combined logic: Only KRPUS load, KRPUS discharge, and Restow containers
        const combined = [];

        this.disContainers.forEach(c => {
            const pod = c.pod || c.port;
            if (c.isRestow || pod === this.targetPort) {
                combined.push(c);
            }
        });

        this.lodContainers.forEach(c => {
            const pol = c.pol || c.port;
            if (c.isRestow) {
                // Include restow's load position as well
                combined.push(c);
            } else if (pol === this.targetPort) {
                combined.push(c);
            }
        });

        return combined;
    }

    // Open detailed view for one or more bay codes, with side info panel
    openDetailedBayGroup(bayCodes) {
        if (this.bayGroupsForNavigation && this.bayGroupsForNavigation.length > 0) {
            const strCodes = bayCodes.join(',');
            this.currentBayGroupIdx = this.bayGroupsForNavigation.findIndex(g => g.join(',') === strCodes);
        }

        const title = bayCodes.map(b => parseInt(b) % 2 === 0 ? `BAY ${b}(40')` : `BAY ${b}`).join(' / ');
        document.getElementById('modalTitle').textContent = `${title}`;
        const container = document.getElementById('detailedBayGrid');
        container.innerHTML = '';

        // Layout: scrollable/draggable area (left) + info panel (right, sticky)
        const layout = document.createElement('div');
        layout.style.cssText = 'display:flex; gap:20px; align-items:flex-start; flex:1; min-height:0; width:100%;';

        const scrollArea = document.createElement('div');
        scrollArea.id = 'bayScrollArea';
        scrollArea.style.cssText = 'flex:1; overflow:auto; display:block; text-align:center; height:100%; cursor:grab; box-sizing:border-box; padding:20px 0;';

        const gridsWrapper = document.createElement('div');
        gridsWrapper.style.cssText = 'display:inline-flex; gap:30px; vertical-align:middle; justify-content:center; align-items:center; min-height:100%;';

        // Mouse Drag to Scroll Logic
        let isDown = false;
        let startX, startY, scrollLeft, scrollTop;

        scrollArea.addEventListener('mousedown', (e) => {
            isDown = true;
            scrollArea.style.cursor = 'grabbing';
            startX = e.clientX;
            startY = e.clientY;
            scrollLeft = scrollArea.scrollLeft;
            scrollTop = scrollArea.scrollTop;
        });
        scrollArea.addEventListener('mouseleave', () => { isDown = false; scrollArea.style.cursor = 'grab'; });
        scrollArea.addEventListener('mouseup', () => { isDown = false; scrollArea.style.cursor = 'grab'; });
        scrollArea.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const walkX = (e.clientX - startX) * 1.5;
            const walkY = (e.clientY - startY) * 1.5;
            scrollArea.scrollLeft = scrollLeft - walkX;
            scrollArea.scrollTop = scrollTop - walkY;
        });

        // Info panel
        const infoPanel = document.createElement('div');
        infoPanel.id = 'ctrInfoPanel';
        infoPanel.innerHTML = `<div style="color:var(--text-secondary);font-size:13px;text-align:center;padding:20px 0;">Click a container<br>to see details</div>`;
        infoPanel.style.cssText = 'width:210px;flex-shrink:0;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:0;padding:14px;position:sticky;top:0;';

        bayCodes.forEach(bayCode => {
            const baySection = document.createElement('div');
            baySection.style.cssText = 'flex:0 0 auto;';

            const h = document.createElement('h3');
            h.textContent = `BAY ${bayCode}${parseInt(bayCode) % 2 === 0 ? " (40')" : ''}`;
            h.style.cssText = 'font-size:12px;color:var(--accent-color);text-align:center;margin-bottom:8px;';
            baySection.appendChild(h);

            baySection.appendChild(this.buildDetailGrid('ON DECK', bayCode, false, infoPanel));
            const hatch = document.createElement('div');
            hatch.className = 'hatch-cover';
            baySection.appendChild(hatch);
            baySection.appendChild(this.buildDetailGrid('UNDER DECK (HOLD)', bayCode, true, infoPanel));

            gridsWrapper.appendChild(baySection);
        });

        scrollArea.appendChild(gridsWrapper);
        layout.appendChild(scrollArea);
        layout.appendChild(infoPanel);
        container.appendChild(layout);
        this.currentGridsWrapper = gridsWrapper;

        document.getElementById('bayModal').classList.remove('hidden');

        // Auto-scale grid to fill screen without scrolling
        requestAnimationFrame(() => this.fitBayGridToScreen(infoPanel, scrollArea));
    }

    fitBayGridToScreen(infoPanel, scrollArea) {
        if (!this.currentGridsWrapper) return;
        const gridsWrapper = this.currentGridsWrapper;
        const mc = document.querySelector('.modal-content');
        if (!mc) return;

        // Available height: modal height minus title, padding, hatch-cover, labels
        const titleEl = document.getElementById('modalTitle');
        const titleH = titleEl ? titleEl.offsetHeight + 16 : 60;
        const padV = 56;  // top + bottom padding
        const padH = 64;  // left + right padding
        const panelW = (infoPanel ? infoPanel.offsetWidth : 210) + 20;

        const availW = mc.clientWidth - panelW - padH;
        const availH = mc.clientHeight - titleH - padV;

        gridsWrapper.style.zoom = '';       // reset first
        const natW = gridsWrapper.scrollWidth;
        const natH = gridsWrapper.scrollHeight;

        if (!natW || !natH || availW <= 0 || availH <= 0) return;

        let scale = Math.min(availW / natW, availH / natH);

        this.autoScale = scale; // Save auto-fit ratio

        // Update slider value
        const slider = document.getElementById('zoomSlider');
        if (slider) slider.value = Math.round(scale * 100);

        this.applyZoom(scale);
    }

    applyZoom(scale) {
        if (!this.currentGridsWrapper) return;
        this.currentGridsWrapper.style.zoom = scale.toFixed(4);

        const text = document.getElementById('zoomPercent');
        if (text) text.textContent = Math.round(scale * 100) + '%';
    }

    // Build one ON-DECK or HOLD grid with row/tier labels and clickable slots
    buildDetailGrid(label, bayCode, isHold, infoPanel) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `<p style="font-size:10px;color:var(--text-secondary);margin-bottom:3px;">${label}</p>`;

        const grid = document.createElement('div');
        grid.className = 'grid-section';

        for (let t = 24; t >= 0; t--) {
            for (let r = 0; r < 30; r++) {
                const slot = document.createElement('div');
                slot.className = 'slot';
                const found = this.checkAndFillSlot(slot, bayCode, r, t, isHold);
                if (found) {
                    slot.style.cursor = 'pointer';
                    slot.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.showContainerInfo(found, infoPanel);
                    });
                }
                grid.appendChild(slot);
            }
            // Tier label (31st column in this row)
            const tierLbl = document.createElement('div');
            tierLbl.className = 'tier-label';
            const tierNum = isHold ? (2 + t * 2) : (70 + t * 2);
            tierLbl.textContent = tierNum.toString().padStart(2, '0');
            grid.appendChild(tierLbl);
        }

        // Bottom row: row-number labels (30 cells + 1 blank corner)
        for (let r = 0; r < 30; r++) {
            const code = this.colIdxToRowCode(r);
            const rowLbl = document.createElement('div');
            rowLbl.className = 'row-label' + (code === '01' ? ' center-row' : '');
            rowLbl.textContent = code;
            grid.appendChild(rowLbl);
        }
        grid.appendChild(document.createElement('div')); // corner blank

        wrapper.appendChild(grid);
        return wrapper;
    }

    // Convert grid column index (0-29) to maritime row code string
    colIdxToRowCode(r) {
        if (r === 15) return '01';
        if (r < 15) return ((15 - r) * 2).toString().padStart(2, '0');       // port  02,04…
        return ((r - 15) * 2 + 1).toString().padStart(2, '0');                   // stbd  03,05…
    }

    // Show container details in the info panel
    showContainerInfo(c, panel) {
        const feIcon = c.fullEmpty === 'F' ? '🟢 FULL' : c.fullEmpty === 'E' ? '⚪ EMPTY' : '?';
        const mappedType = this.getMappedType(c.type);
        const rows = [
            ['CTR No.', c.id || '-'],
            ['Position', c.pos || '-'],
            ['ISO Type', mappedType || '-'],
            ['Size', c.size + "'"],
            ['POL', c.pol || c.port || '-'],
            ['POD', c.pod || '-'],
            ['F / E', feIcon],
            ['Weight', c.weight ? c.weight + ' T' : '-'],
        ];
        if (c.temp !== null && c.temp !== undefined) rows.push(['Temp', `${c.temp}°C`]);
        if (c.dg) rows.push(['DG', `<span style="color:#f87171">${c.dg}</span>`]);
        if (c.isRestow) rows.push(['', '<span style="color:#f59e0b">♻ RESTOW</span>']);

        panel.innerHTML = `
            <div style="font-size:13px;font-weight:700;color:var(--accent-color);margin-bottom:10px;">📦 Container Info</div>
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
                ${rows.map(([k, v]) => `
                <tr>
                    <td style="color:var(--text-secondary);padding:4px 6px 4px 0;white-space:nowrap;">${k}</td>
                    <td style="padding:4px 0;word-break:break-all;">${v}</td>
                </tr>`).join('')}
            </table>`;
    }

    navigateBay(offset) {
        if (!this.bayGroupsForNavigation || this.bayGroupsForNavigation.length === 0) return;

        let newIdx = this.currentBayGroupIdx + offset;
        if (newIdx < 0) newIdx = this.bayGroupsForNavigation.length - 1;
        if (newIdx >= this.bayGroupsForNavigation.length) newIdx = 0;

        this.openDetailedBayGroup(this.bayGroupsForNavigation[newIdx]);
    }

    openDetailedBay(bayCode) {
        this.openDetailedBayGroup([bayCode]);
    }

    getMappedType(rawType) {
        if (!rawType) return '';
        return ISO_TYPE_MAPPING[rawType] || rawType;
    }

    checkAndFillSlot(element, bayCode, rowIdx, tierIdx, isHold) {
        const containers = this.getAllVisibleContainers().filter(c => c.pos.startsWith(bayCode));

        const occupants = containers.filter(c => {
            const cRow = parseInt(c.pos.substring(2, 4));
            const cTier = parseInt(c.pos.substring(4, 6));
            const isOnDeck = cTier >= 70;

            if (isHold && isOnDeck) return false;
            if (!isHold && !isOnDeck) return false;

            const mappedR = this.getRowIdx(cRow);
            const mappedT = this.getTierIdx(cTier, isOnDeck);

            return mappedR === rowIdx && mappedT === tierIdx;
        });

        if (occupants.length > 0) {
            element.classList.add('occupied');

            const bayInt = parseInt(bayCode);

            if (occupants.length === 1 || this.viewMode !== 'combined') {
                const found = occupants[0];
                const color = this.getColorForContainer(found);

                if (bayInt % 2 !== 0) {
                    if (bayInt % 4 === 1) { // FWD: Top-Left
                        element.style.background = `linear-gradient(to bottom right, ${color} 50%, transparent 50%)`;
                    } else { // AFT: Bottom-Right
                        element.style.background = `linear-gradient(to top left, ${color} 50%, transparent 50%)`;
                    }
                } else {
                    element.style.backgroundColor = color;
                }

                element.innerHTML = `<span style="font-size: 6px; transform: scale(0.8);">${found.size}</span>`;
                const mappedType = this.getMappedType(found.type);
                element.title = `${found.id} (${mappedType})\nPort: ${found.port}`;
                if (found.dg) {
                    element.style.outline = '2px solid #ef4444';
                    element.style.outlineOffset = '-2px';
                } else if (found.temp !== null && found.temp !== undefined) {
                    element.style.outline = '2px solid #38bdf8';
                    element.style.outlineOffset = '-2px';
                }
            } else {
                // Shared slot (Combine mode overlay)
                const c1 = occupants[0];
                const c2 = occupants[1];
                const color1 = this.getColorForContainer(c1);
                const color2 = this.getColorForContainer(c2);

                element.style.background = `linear-gradient(135deg, ${color1} 50%, ${color2} 50%)`;
                element.innerHTML = `<span style="font-size: 6px; transform: scale(0.8);">${c1.size}</span>`;

                const t1 = this.getMappedType(c1.type);
                const t2 = this.getMappedType(c2.type);
                element.title = `[1] ${c1.id} (${t1})\n[2] ${c2.id} (${t2})`;

                if (c1.dg || c2.dg) {
                    element.style.outline = '2px solid #ef4444';
                    element.style.outlineOffset = '-2px';
                }
            }
            return occupants[0]; // Used by click listener
        }
        return null; // Return null if no container (slots remain empty)
    }

    renderRecap() {
        const bays = this.getBays();

        // Filter strictly to current operational moves
        const validDis = this.disContainers.filter(c => (c.pod || c.port) === this.targetPort || c.isRestow);
        const validLod = this.lodContainers.filter(c => (c.pol || c.port) === this.targetPort || c.isRestow);

        let disCount = { total: 0, f20: 0, e20: 0, f40: 0, e40: 0 };
        let lodCount = { total: 0, f20: 0, e20: 0, f40: 0, e40: 0 };

        const processStats = (list, stats) => {
            list.forEach(c => {
                stats.total++;
                if (c.size === 20) {
                    if (c.fullEmpty === 'E') stats.e20++; else stats.f20++;
                } else {
                    if (c.fullEmpty === 'E') stats.e40++; else stats.f40++;
                }
            });
        };

        processStats(validDis, disCount);
        processStats(validLod, lodCount);

        const container = document.getElementById('recapBaysContainer');
        container.innerHTML = '';

        const chartContainer = document.getElementById('bayChartBars');
        if (chartContainer) chartContainer.innerHTML = '';
        const chartData = [];
        let maxTotal = 0;

        // Pre-compute twin pairs per bay (combining DIS + LOD 20ft containers)
        const computeTwinMapForList = (list) => {
            const map = {};
            const groups = {};

            list.forEach(c => {
                if (c.size !== 20) return;
                const b = parseInt(c.pos.substring(0, 2));
                if (b % 2 === 0) return; // Evaluate only odd 20' bays

                const rt = c.pos.substring(2, 6);
                const parentBay = Math.ceil(b / 4) * 4 - 2;
                const k = `${parentBay}-${rt}`;

                if (!groups[k]) groups[k] = [b];
                else {
                    groups[k].push(b);
                    if (groups[k].length === 2) { // Pair found
                        const b1 = String(groups[k][0]).padStart(2, '0');
                        const b2 = String(groups[k][1]).padStart(2, '0');
                        if (!map[b1]) map[b1] = { tw: 0 };
                        if (!map[b2]) map[b2] = { tw: 0 };
                        map[b1].tw++;
                        map[b2].tw++;
                    }
                }
            });
            return map;
        };

        const disTwinMap = computeTwinMapForList(validDis);
        const lodTwinMap = computeTwinMapForList(validLod);

        const bayGroups = {};

        bays.forEach(bay => {
            const dis = validDis.filter(c => c.pos.substring(0, 2) === bay);
            const lod = validLod.filter(c => c.pos.substring(0, 2) === bay);
            const totalMoves = dis.length + lod.length;
            if (totalMoves === 0) return; // Skip completely empty

            // Twin info for this bay (combine dis and lod twin maps)
            const disTw = disTwinMap[bay] ? disTwinMap[bay].tw : 0;
            const lodTw = lodTwinMap[bay] ? lodTwinMap[bay].tw : 0;
            const tw = disTw + lodTw;

            // Asymmetric Twin Lift Distribution:
            // The FWD bay (01, 05...) acts as the Primary lift, executing the `tw` moves.
            // The paired AFT bay (03, 07...) rides along for free, saving `tw` moves.
            let twt = totalMoves;
            const bayNum = parseInt(bay);
            if (bayNum % 4 === 3) {
                // AFT bay: Subtract the tw moves since they were handled by the FWD bay lift
                twt = Math.max(0, totalMoves - tw);
            }

            // Keep track for chart
            if (totalMoves > maxTotal) maxTotal = totalMoves;
            chartData.push({ bay, total: totalMoves, d: dis.length, l: lod.length, twt, tw });

            const cell = document.createElement('div');
            cell.className = 'bay-grid-cell';

            let twinHtml = '';
            if (tw > 0) {
                if (bayNum % 4 === 1) {
                    // FWD bay: Show TW text and its full TwT moves
                    twinHtml = `
                        <div style="color: #ec4899; font-size: 11px; font-weight: bold; margin-top: 2px;">TW: ${tw}</div>
                        <div style="color: #a855f7; font-size: 11px; font-weight: bold; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 2px; margin-top: 2px;">TwT: ${twt}</div>
                    `;
                } else if (bayNum % 4 === 3) {
                    // AFT bay: Hide the TW label (handled by FWD) and show the remaining TwT moves
                    twinHtml = `
                        <div style="font-size: 11px; margin-top: 2px; visibility: hidden;">TW: ${tw}</div>
                        <div style="color: #a855f7; font-size: 11px; font-weight: bold; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 2px; margin-top: 2px;">TwT: ${twt}</div>
                    `;
                }
            }

            cell.innerHTML = `
                <div class="bay-header">${bay}</div>
                <div class="bay-data" style="display: flex; flex-direction: column; height: 100%;">
                    <div style="color: #f59e0b; ${dis.length > 0 ? '' : 'visibility: hidden;'}">D: ${dis.length}</div>
                    <div style="color: #22c55e; ${lod.length > 0 ? '' : 'visibility: hidden;'}">L: ${lod.length}</div>
                    <div style="color: #38bdf8; margin-top: auto; padding-top: 3px; border-top: 1px solid rgba(255,255,255,0.1);">T: ${totalMoves}</div>
                    ${twinHtml}
                </div>
            `;

            // Group the cells by physical root cluster (e.g. 01, 02, 03 map to root 2)
            const root = Math.ceil((parseInt(bay) + 1) / 4) * 4 - 2;
            if (!bayGroups[root]) bayGroups[root] = [];
            bayGroups[root].push(cell);
        });

        // Append groups sequentially
        Object.keys(bayGroups).sort((a, b) => parseInt(a) - parseInt(b)).forEach(root => {
            const grpDiv = document.createElement('div');
            grpDiv.className = 'bay-group';
            bayGroups[root].forEach(cell => grpDiv.appendChild(cell));
            container.appendChild(grpDiv);
        });


        // Draw charts via a helper function
        const drawBarChart = (domContainer, data, valueKey, colorStart, colorEnd, tooltipFn) => {
            if (!domContainer || data.length === 0) return;
            const max = Math.max(...data.map(d => d[valueKey] || 0));
            data.forEach(d => {
                const val = d[valueKey] || 0;
                const heightPercent = max > 0 ? (val / max) * 100 : 0;

                const barBlock = document.createElement('div');
                barBlock.style.cssText = `flex:1; display:flex; flex-direction:column; justify-content:flex-end; align-items:center; height:100%;`;

                const bar = document.createElement('div');
                bar.style.cssText = `
                    width: 70%; max-width: 30px; height: ${heightPercent}%;
                    background: linear-gradient(to top, ${colorStart}, ${colorEnd});
                    border-top-left-radius: 3px; border-top-right-radius: 3px;
                    transition: height 0.5s ease-out;
                `;

                const lbl = document.createElement('div');
                lbl.textContent = d.bay;
                lbl.style.cssText = `margin-top:8px; font-size:11px; color:var(--text-secondary); font-weight:bold;`;

                barBlock.title = tooltipFn(d);
                barBlock.appendChild(bar);
                barBlock.appendChild(lbl);
                domContainer.appendChild(barBlock);
            });
        };

        // Chart 1: Total moves (blue)
        if (chartContainer && chartData.length > 0) {
            drawBarChart(
                chartContainer, chartData, 'total',
                'rgba(56,189,248,0.4)', 'rgba(56,189,248,0.9)',
                d => `Bay ${d.bay}\nTotal: ${d.total} (D:${d.d}, L:${d.l})`
            );
        }

        // Chart 2: Twin-adjusted moves (purple)
        const twinChartContainer = document.getElementById('bayChartBarsTwin');
        if (twinChartContainer) twinChartContainer.innerHTML = '';
        if (twinChartContainer && chartData.length > 0) {
            drawBarChart(
                twinChartContainer, chartData, 'twt',
                'rgba(168,85,247,0.4)', 'rgba(168,85,247,0.9)',
                d => `Bay ${d.bay}\nActual Moves: ${d.twt} (TW saved: ${d.tw ?? 0})`
            );
        }

        // Update Dashboard Headers
        document.getElementById('kpiDisTotal').textContent = disCount.total;
        document.getElementById('kpiDis20F').textContent = disCount.f20;
        document.getElementById('kpiDis20E').textContent = disCount.e20;
        document.getElementById('kpiDis40F').textContent = disCount.f40;
        document.getElementById('kpiDis40E').textContent = disCount.e40;

        document.getElementById('kpiLodTotal').textContent = lodCount.total;
        document.getElementById('kpiLod20F').textContent = lodCount.f20;
        document.getElementById('kpiLod20E').textContent = lodCount.e20;
        document.getElementById('kpiLod40F').textContent = lodCount.f40;
        document.getElementById('kpiLod40E').textContent = lodCount.e40;

        document.getElementById('kpiGrandTotal').textContent = disCount.total + lodCount.total;
        document.getElementById('kpiTot20F').textContent = disCount.f20 + lodCount.f20;
        document.getElementById('kpiTot20E').textContent = disCount.e20 + lodCount.e20;
        document.getElementById('kpiTot40F').textContent = disCount.f40 + lodCount.f40;
        document.getElementById('kpiTot40E').textContent = disCount.e40 + lodCount.e40;

        // Calculate and Display Restow Count
        let restowCount = 0;
        validDis.forEach(c => { if (c.isRestow) restowCount++; });
        document.getElementById('kpiRestowTotal').textContent = restowCount;

        // Twin Pair Calculation (Actual G/C Moves)
        const countTwins = (list) => {
            let twinPairs = 0;
            const groups = {};
            list.forEach(c => {
                if (c.size !== 20) return;
                const b = parseInt(c.pos.substring(0, 2));
                if (b % 2 === 0) return; // Evaluate only odd 20' bays

                const rt = c.pos.substring(2, 6);
                const parentBay = Math.ceil(b / 4) * 4 - 2;
                const k = `${parentBay}-${rt}`;

                if (!groups[k]) groups[k] = 1;
                else if (++groups[k] === 2) twinPairs++;
            });
            return twinPairs;
        };

        const totalTwins = countTwins(validDis) + countTwins(validLod);
        const totalBoxes = disCount.total + lodCount.total;
        const actualGCMoves = totalBoxes - totalTwins;

        const elBox = document.getElementById('kpiBoxCount');
        const elTwin = document.getElementById('kpiTwinCount');
        const elActual = document.getElementById('kpiActualBoxes');
        if (elBox) elBox.textContent = totalBoxes;
        if (elTwin) elTwin.textContent = totalTwins;
        if (elActual) elActual.textContent = actualGCMoves;

        const elTotalMoves = document.getElementById('totalMoves');
        if (elTotalMoves) elTotalMoves.textContent = actualGCMoves;

        this.updateSimulationCalc();
    }

    updateSimulationCalc() {
        const totalBoxText = document.getElementById('kpiActualBoxes')?.textContent || '0';
        const totalMoves = parseInt(totalBoxText) || 0;

        const prod = parseFloat(document.getElementById('calcProd')?.value) || 1;
        const gangs = parseFloat(document.getElementById('calcGang')?.value) || 1;
        const targetHours = parseFloat(document.getElementById('calcTargetBerth')?.value) || 12;

        if (totalMoves === 0) return;

        let workTime = totalMoves / (prod * gangs);
        let reqBerth = Math.round(workTime) + 2;

        const effectiveHours = Math.max(targetHours - 2, 0.1);
        const reqGangs = totalMoves / (prod * effectiveHours);

        const outReqBerth = document.getElementById('outRequiredBerth');
        if (outReqBerth) outReqBerth.textContent = reqBerth > 2 ? reqBerth + 'h' : '-';

        const outReqGang = document.getElementById('outRequiredGang');
        if (outReqGang) outReqGang.textContent = reqGangs > 0 ? Math.ceil(reqGangs) : '-';
    }

    refreshSimulation() {
        const totalMoves = parseInt(document.getElementById('totalMoves').textContent) || 0;
        if (totalMoves === 0) return;

        const productivityPerGC = 25; // Constant for now: 25 moves/hour
        const workTime = totalMoves / (this.gcCount * productivityPerGC);
        const totalBerthTime = workTime + 2; // +1h berthing, +1h unberthing

        document.getElementById('estBerthTime').textContent = `${totalBerthTime.toFixed(1)}h`;
        document.getElementById('avgProductivity').textContent = (totalMoves / workTime).toFixed(1);

        this.renderGCHero(totalMoves, workTime);
    }

    renderGCHero(totalMoves, workTime) {
        const container = document.getElementById('gcAllocationChart');
        container.innerHTML = '<h3 style="margin-bottom: 20px;">Gantry Crane Workload Distribution</h3>';

        const bays = this.getBays();
        const totalBays = bays.length;
        const baysPerCrane = Math.ceil(totalBays / this.gcCount);

        for (let i = 0; i < this.gcCount; i++) {
            const startIdx = i * baysPerCrane;
            const endIdx = Math.min(startIdx + baysPerCrane, totalBays);
            const assignedBays = bays.slice(startIdx, endIdx);

            let craneMoves = 0;
            assignedBays.forEach(bay => {
                craneMoves += this.disContainers.filter(c => c.pos.startsWith(bay)).length;
                craneMoves += this.lodContainers.filter(c => c.pos.startsWith(bay)).length;
            });

            const row = document.createElement('div');
            row.className = 'stat-card';
            row.style.marginBottom = '15px';
            row.style.background = 'rgba(255,255,255,0.03)';

            row.innerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <span style="font-weight: 800; color: var(--accent-color);">GC #${i + 1}</span>
                    <span style="font-size: 12px; color: var(--text-secondary);">Bays: ${assignedBays.join(', ')}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 8px;">
                    <span>${craneMoves} Total Moves</span>
                    <span>~${(craneMoves / 25).toFixed(1)} hrs</span>
                </div>
                <div style="height: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; overflow: hidden;">
                    <div style="width: ${(craneMoves / (totalMoves / this.gcCount * 1.5)) * 100}%; height: 100%; background: var(--accent-color); transition: width 0.5s;"></div>
                </div>
            `;
            container.appendChild(row);
        }
    }

    optimizeGC() {
        const targetTime = parseFloat(document.getElementById('targetBerthTime').value);
        if (!targetTime || targetTime <= 2) {
            alert("Please enter a valid target berth time (> 2h).");
            return;
        }

        const totalMoves = parseInt(document.getElementById('totalMoves').textContent) || 0;
        if (totalMoves === 0) return;

        const workTimeNeeded = targetTime - 2;
        const productivityPerGC = 25;
        const requiredGC = Math.ceil(totalMoves / (workTimeNeeded * productivityPerGC));

        document.getElementById('gcCount').value = requiredGC;
        this.gcCount = requiredGC;
        this.refreshSimulation();

        alert(`To achieve ${targetTime}h berth time, you need at least ${requiredGC} Gantry Cranes.`);
    }

    switchListTab(mode) {
        this.currentListTab = mode;
        const btnDis = document.getElementById('listTabDis');
        const btnLod = document.getElementById('listTabLod');
        if (!btnDis) return;

        if (mode === 'dis') {
            btnDis.style.background = 'rgba(245,158,11,0.2)';
            btnDis.style.border = '1px solid #f59e0b';
            btnDis.style.color = '#f59e0b';
            btnLod.style.background = 'transparent';
            btnLod.style.border = '1px solid var(--glass-border)';
            btnLod.style.color = 'var(--text-secondary)';
        } else {
            btnLod.style.background = 'rgba(34,197,94,0.2)';
            btnLod.style.border = '1px solid #22c55e';
            btnLod.style.color = '#22c55e';
            btnDis.style.background = 'transparent';
            btnDis.style.border = '1px solid var(--glass-border)';
            btnDis.style.color = 'var(--text-secondary)';
        }
        this.renderContainerList(mode);
    }

    sortList(col) {
        if (this.listSortCol === col) {
            this.listSortAsc = !this.listSortAsc;
        } else {
            this.listSortCol = col;
            this.listSortAsc = true;
        }
        this.renderContainerList(this.currentListTab || 'dis');
    }

    renderContainerList(mode) {
        let list = mode === 'dis' ? [...this.disContainers] : [...this.lodContainers];
        // Filter strictly to current operational moves
        if (mode === 'dis') {
            list = list.filter(c => (c.pod || c.port) === this.targetPort || c.isRestow);
        } else {
            list = list.filter(c => (c.pol || c.port) === this.targetPort || c.isRestow);
        }

        this.renderListRecap(list, mode);

        // Apply sorting before rendering
        if (this.listSortCol && this.listSortCol !== 'index') {
            list.sort((a, b) => {
                let valA, valB;
                switch (this.listSortCol) {
                    case 'id': valA = a.id || ''; valB = b.id || ''; break;
                    case 'pos': valA = a.pos || ''; valB = b.pos || ''; break;
                    case 'size': valA = a.size || 0; valB = b.size || 0; break;
                    case 'type': valA = this.getMappedType(a.type) || ''; valB = this.getMappedType(b.type) || ''; break;
                    case 'pol': valA = a.pol || a.port || ''; valB = b.pol || b.port || ''; break;
                    case 'pod': valA = a.pod || ''; valB = b.pod || ''; break;
                    case 'fe': valA = a.fullEmpty || ''; valB = b.fullEmpty || ''; break;
                    case 'weight': valA = a.weight || 0; valB = b.weight || 0; break;
                    case 'dg': valA = a.dg || ''; valB = b.dg || ''; break;
                    case 'temp': valA = a.temp === undefined ? -999 : a.temp; valB = b.temp === undefined ? -999 : b.temp; break;
                }

                if (valA < valB) return this.listSortAsc ? -1 : 1;
                if (valA > valB) return this.listSortAsc ? 1 : -1;
                return 0;
            });
        } // if 'index', list remains in its currently filtered original parse order

        // Update headers to show counts and arrows
        const countMap = {
            'id': list.length,
            'dg': list.filter(c => c.dg && c.dg.trim() !== '').length,
            'temp': list.filter(c => c.temp !== undefined && c.temp !== null && c.temp !== '').length
        };

        const headers = document.querySelectorAll('#containerListTable th');
        headers.forEach(th => {
            const onclick = th.getAttribute('onclick');
            if (onclick) {
                const colMatch = onclick.match(/'(\w+)'/);
                if (colMatch) {
                    const col = colMatch[1];
                    // Save original base text on first render
                    if (!th.hasAttribute('data-base')) {
                        let rawText = th.innerText.replace(/▲|▼/g, '').replace(/\(\d+\)/g, '').trim();
                        th.setAttribute('data-base', rawText);
                    }
                    const baseText = th.getAttribute('data-base');

                    let text = baseText;
                    if (countMap[col] !== undefined) {
                        if (countMap[col] > 0 || col === 'id') {
                            text += ` <span style="color:#a855f7;font-size:11px;">(${countMap[col]})</span>`;
                        }
                    }

                    if (this.listSortCol === col) {
                        text += this.listSortAsc ? ' ▲' : ' ▼';
                    }
                    th.innerHTML = text;
                }
            }
        });

        const body = document.getElementById('containerListBody');
        if (!body) return;
        body.innerHTML = '';

        list.forEach((c, i) => {
            const tr = document.createElement('tr');
            const mappedType = this.getMappedType(c.type);
            const fe = c.fullEmpty === 'F' ? 'FULL' : c.fullEmpty === 'E' ? 'EMPTY' : '-';
            const feColor = c.fullEmpty === 'F' ? '#22c55e' : '#94a3b8';
            tr.innerHTML = `
                <td style="text-align:center;color:var(--text-secondary);">${i + 1}</td>
                <td style="font-weight:700;">${c.id || '-'}</td>
                <td style="text-align:center;font-family:monospace;">${c.pos || '-'}</td>
                <td style="text-align:center;">${c.size}'</td>
                <td style="text-align:center;">${mappedType || '-'}</td>
                <td>${c.pol || c.port || '-'}</td>
                <td>${c.pod || '-'}</td>
                <td style="color:${feColor};font-weight:600;">${fe}</td>
                <td style="text-align:right;">${c.weight ? c.weight + ' T' : '-'}</td>
                <td style="text-align:center;color:#ef4444;font-weight:600;">${c.dg || ''}</td>
                <td style="text-align:right;color:#38bdf8;">${(c.temp !== undefined && c.temp !== null && c.temp !== '') ? c.temp + '°C' : ''}</td>
            `;
            body.appendChild(tr);
        });
    }

    renderListRecap(list, mode) {
        const container = document.getElementById('listRecapContainer');
        if (!container) return;

        // Strictly re-filter: only containers whose POD (dis) or POL (lod) equals targetPort
        if (mode === 'dis') {
            list = list.filter(c => c.pod === this.targetPort);
        } else {
            list = list.filter(c => (c.pol || c.port) === this.targetPort);
        }

        if (list.length === 0) { container.innerHTML = ''; return; }

        // For discharge: group by POD; For load: group by POD (next dest)
        const getGroupKey = (c) => {
            if (mode === 'dis') return c.pod || c.port || '-';
            else return c.pod || '-'; // next destination for loaded cargo
        };

        // Helper: is this container a 40' High Cube?
        const is40HC = (c) => {
            if (c.size !== 40) return false;
            const mapped = this.getMappedType(c.type) || '';
            return mapped.includes('HC') || mapped.includes('HQ') || mapped.includes('HT');
        };

        const groups = {};
        list.forEach(c => {
            const key = getGroupKey(c);
            if (!groups[key]) {
                groups[key] = {
                    port: key,
                    s20F: 0, s20E: 0,
                    s40F: 0, s40E: 0,
                    s40HF: 0, s40HE: 0,
                    s45F: 0, s45E: 0,
                    rf: 0, dg: 0,
                    weight: 0
                };
            }
            const g = groups[key];
            const isFull = c.fullEmpty !== 'E';
            const isRF = c.temp !== null && c.temp !== undefined && c.temp !== '';
            const isDG = !!c.dg;

            if (c.size === 20) { isFull ? g.s20F++ : g.s20E++; }
            else if (c.size === 45) { isFull ? g.s45F++ : g.s45E++; }
            else if (is40HC(c)) { isFull ? g.s40HF++ : g.s40HE++; }
            else { isFull ? g.s40F++ : g.s40E++; }

            if (isRF) g.rf++;
            if (isDG) g.dg++;
            if (c.weight) g.weight += parseFloat(c.weight);
        });

        const rows = Object.values(groups).sort((a, b) => {
            const tA = a.s20F + a.s20E + a.s40F + a.s40E + a.s40HF + a.s40HE + a.s45F + a.s45E;
            const tB = b.s20F + b.s20E + b.s40F + b.s40E + b.s40HF + b.s40HE + b.s45F + b.s45E;
            return tB - tA;
        });

        const getTeu = (g) =>
            (g.s20F + g.s20E) + (g.s40F + g.s40E + g.s40HF + g.s40HE + g.s45F + g.s45E) * 2;
        const getTeuE = (g) =>
            g.s20E + (g.s40E + g.s40HE + g.s45E) * 2;

        const portLabel = mode === 'dis' ? 'POD' : 'POD (Next)';
        const th = (t, right) => `<th style="padding:5px 10px;text-align:${right ? 'right' : 'center'};color:var(--text-secondary);font-size:11px;white-space:nowrap;border-bottom:1px solid rgba(255,255,255,0.1);">${t}</th>`;
        const td = (v, accent, right) => `<td style="padding:4px 10px;text-align:${right ? 'right' : 'center'};font-size:11px;white-space:nowrap;${accent ? `color:${accent};font-weight:bold;` : ''}">${v}</td>`;
        const fmtCount = (f, e) => e > 0 ? `${f + e}(${e})` : `${f + e}`;
        const fmtTeu = (teu, teuE) => teuE > 0 ? `${teu}(${teuE})` : `${teu}`;

        let html = `<div style="overflow-x:auto;"><table class="list-table" style="min-width:100%;border-radius:6px;background:rgba(0,0,0,0.15);margin-bottom:0;border-collapse:collapse;">
            <thead style="background:rgba(255,255,255,0.06);">
                <tr>
                    ${th(portLabel)}
                    ${th("20'(E)")}
                    ${th("40'(E)")}
                    ${th("40H'(E)")}
                    ${th("45'(E)")}
                    ${th('<span style="color:#38bdf8">RF</span>')}
                    ${th('<span style="color:#ef4444">DG</span>')}
                    ${th('<span style="color:var(--accent-color)">TTL</span>')}
                    ${th('TEU F(E)')}
                    ${th('WEIGHT(T)', true)}
                </tr>
            </thead>
            <tbody>`;

        let totS20F = 0, totS20E = 0, totS40F = 0, totS40E = 0, tot40HF = 0, tot40HE = 0, tot45F = 0, tot45E = 0;
        let totRF = 0, totDG = 0, totWgt = 0;

        rows.forEach((g, i) => {
            const ttl = g.s20F + g.s20E + g.s40F + g.s40E + g.s40HF + g.s40HE + g.s45F + g.s45E;
            const teu = getTeu(g);
            const teuE = getTeuE(g);
            totS20F += g.s20F; totS20E += g.s20E;
            totS40F += g.s40F; totS40E += g.s40E;
            tot40HF += g.s40HF; tot40HE += g.s40HE;
            tot45F += g.s45F; tot45E += g.s45E;
            totRF += g.rf; totDG += g.dg; totWgt += g.weight;

            html += `<tr style="border-top:1px solid rgba(255,255,255,0.05);${i % 2 === 1 ? 'background:rgba(255,255,255,0.02);' : ''}">
                ${td('<b>' + g.port + '</b>', null)}
                ${td(fmtCount(g.s20F, g.s20E), null)}
                ${td(fmtCount(g.s40F, g.s40E), null)}
                ${td(fmtCount(g.s40HF, g.s40HE), null)}
                ${td(fmtCount(g.s45F, g.s45E), null)}
                ${td(g.rf > 0 ? g.rf : '', g.rf > 0 ? '#38bdf8' : null)}
                ${td(g.dg > 0 ? g.dg : '', g.dg > 0 ? '#ef4444' : null)}
                ${td(ttl, 'var(--accent-color)')}
                ${td(fmtTeu(teu, teuE), null)}
                ${td(g.weight > 0 ? g.weight.toFixed(1) : '-', null, true)}
            </tr>`;
        });

        const totTtl = totS20F + totS20E + totS40F + totS40E + tot40HF + tot40HE + tot45F + tot45E;
        const totTeu = (totS20F + totS20E) + (totS40F + totS40E + tot40HF + tot40HE + tot45F + tot45E) * 2;
        const totTeuE = totS20E + (totS40E + tot40HE + tot45E) * 2;

        html += `<tr style="border-top:2px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.35);font-weight:bold;">
                ${td('<b>TOTAL</b>', null)}
                ${td(fmtCount(totS20F, totS20E), '#fff')}
                ${td(fmtCount(totS40F, totS40E), '#fff')}
                ${td(fmtCount(tot40HF, tot40HE), '#fff')}
                ${td(fmtCount(tot45F, tot45E), '#fff')}
                ${td(totRF > 0 ? totRF : '-', totRF > 0 ? '#38bdf8' : '#94a3b8')}
                ${td(totDG > 0 ? totDG : '-', totDG > 0 ? '#ef4444' : '#94a3b8')}
                ${td(totTtl, 'var(--accent-color)')}
                ${td(fmtTeu(totTeu, totTeuE), '#fff')}
                ${td(totWgt > 0 ? totWgt.toFixed(1) : '-', null, true)}
            </tr>
            </tbody></table></div>`;

        container.innerHTML = html;
    }

    exportExcel() {
        const mode = this.currentListTab || 'dis';
        let list = mode === 'dis' ? this.disContainers : this.lodContainers;
        // Filter strictly to current operational moves
        if (mode === 'dis') {
            list = list.filter(c => (c.pod || c.port) === this.targetPort || c.isRestow);
        } else {
            list = list.filter(c => (c.pol || c.port) === this.targetPort || c.isRestow);
        }
        const label = mode === 'dis' ? 'Discharge' : 'Load';

        const headers = ['#', 'CTR No.', 'Position', 'Size', 'ISO Type', 'POL', 'POD', 'F/E', 'Weight(T)', 'DG', 'Temp(C)'];
        const rows = list.map((c, i) => [
            i + 1,
            c.id || '',
            c.pos || '',
            c.size + "'",
            this.getMappedType(c.type) || '',
            c.pol || c.port || '',
            c.pod || '',
            c.fullEmpty === 'F' ? 'FULL' : c.fullEmpty === 'E' ? 'EMPTY' : '',
            c.weight || '',
            c.dg || '',
            (c.temp !== undefined && c.temp !== null && c.temp !== '') ? c.temp : ''
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const bom = '\uFEFF'; // UTF-8 BOM for Excel
        const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.vessel}_${label}_List.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ─────────────────────────────────────────────────────
    // HISTORY  (localStorage key: 'bayplanHistory')
    // ─────────────────────────────────────────────────────

    populateHistoryForm() {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
        document.getElementById('histDate').value = dateStr;

        const vessel = this.vessel || '---';
        const voyage = this.voyage || '---';
        document.getElementById('histVessel').value = `${vessel} / ${voyage}`;
        document.getElementById('histPort').value = this.targetPort || '';

        const dis = this.disContainers.filter(c => c.pod === this.targetPort || c.isRestow).length;
        const lod = this.lodContainers.filter(c => (c.pol || c.port) === this.targetPort || c.isRestow).length;
        document.getElementById('histDis').value = dis;
        document.getElementById('histLod').value = lod;

        const twin = parseInt(document.getElementById('kpiTwinCount')?.textContent) || 0;
        document.getElementById('histTwin').value = twin;

        const restow = parseInt(document.getElementById('kpiRestowTotal')?.textContent) || 0;
        document.getElementById('histRestow').value = restow;

        const berth = document.getElementById('outRequiredBerth')?.textContent || '';
        document.getElementById('histBerth').value = (berth && berth !== '-') ? berth : '';

        const gang = document.getElementById('calcGang')?.value || '';
        document.getElementById('histGang').value = gang;

        const prod = document.getElementById('calcProd')?.value || '';
        document.getElementById('histProd').value = prod;
    }

    getHistory() {
        try { return JSON.parse(localStorage.getItem('bayplanHistory') || '[]'); }
        catch (e) { return []; }
    }

    saveHistory() {
        const record = {
            id: this.editingHistId || Date.now(),
            date: document.getElementById('histDate').value,
            vessel: document.getElementById('histVessel').value,
            port: document.getElementById('histPort').value,
            dis: document.getElementById('histDis').value,
            lod: document.getElementById('histLod').value,
            twin: document.getElementById('histTwin').value,
            restow: document.getElementById('histRestow').value,
            berth: document.getElementById('histBerth').value,
            gang: document.getElementById('histGang').value,
            prod: document.getElementById('histProd').value,
            memo: document.getElementById('histMemo').value,
            // Include EDI data for loading later
            disData: this.disContainers,
            lodData: this.lodContainers,
            vesselName: this.vessel,
            voyageName: this.voyage
        };

        const history = this.getHistory();
        if (this.editingHistId) {
            const idx = history.findIndex(h => h.id === this.editingHistId);
            if (idx !== -1) {
                // Retain data payload and just update editable fields
                record.disData = history[idx].disData;
                record.lodData = history[idx].lodData;
                record.vesselName = history[idx].vesselName;
                record.voyageName = history[idx].voyageName;
                history[idx] = record;
            }
            this.editingHistId = null; // Clear edit mode
        } else {
            if (!record.vessel) { alert('Please load EDI data before saving.'); return; }
            history.unshift(record);
        }

        try {
            localStorage.setItem('bayplanHistory', JSON.stringify(history));
            document.getElementById('histMemo').value = '';
            this.renderHistoryTable();
            alert('Record saved to local history!');
        } catch (e) {
            alert('Storage limit exceeded! Failed to save session data.');
        }
    }

    editHistoryRecord(id) {
        const history = this.getHistory();
        const r = history.find(h => h.id === id);
        if (!r) return;

        this.editingHistId = id;
        document.getElementById('histDate').value = r.date || '';
        document.getElementById('histVessel').value = r.vessel || '';
        document.getElementById('histPort').value = r.port || '';
        document.getElementById('histDis').value = r.dis || '';
        document.getElementById('histLod').value = r.lod || '';
        document.getElementById('histTwin').value = r.twin || '';
        document.getElementById('histRestow').value = r.restow || '';
        document.getElementById('histBerth').value = r.berth || '';
        document.getElementById('histGang').value = r.gang || '';
        document.getElementById('histProd').value = r.prod || '';
        document.getElementById('histMemo').value = r.memo || '';

        // Scroll to form if needed
        const histView = document.getElementById('historyView');
        if (histView) histView.scrollTo({ top: 0, behavior: 'smooth' });
    }

    loadHistoryData(id) {
        const history = this.getHistory();
        const r = history.find(h => h.id === id);
        if (!r || (!r.disData && !r.lodData)) {
            alert("This record doesn't contain full EDI payloads to load.");
            return;
        }
        if (!confirm('Load this session? Current unsaved work will be lost.')) return;

        this.disContainers = r.disData || [];
        this.lodContainers = r.lodData || [];
        this.vessel = r.vesselName || '';
        this.voyage = r.voyageName || '';
        this.targetPort = r.port || '';

        // Update UI controls
        const targetSel = document.getElementById('targetPort');
        if (targetSel && this.targetPort) targetSel.value = this.targetPort;

        const vesselInfo = document.getElementById('vesselInfo');
        if (vesselInfo) {
            vesselInfo.textContent = (this.vessel && this.voyage) ? `${this.vessel} / ${this.voyage}` : 'NO DATA LOADED';
        }

        // Process data through simulator engine
        this.processCombined();

        // Switch back to General Stowage tab
        const stowageTab = document.querySelector('.tab[data-tab="stowage"]');
        if (stowageTab) stowageTab.click();

        alert('Session loaded successfully!');
    }

    deleteHistoryRecord(id) {
        const history = this.getHistory().filter(r => r.id !== id);
        localStorage.setItem('bayplanHistory', JSON.stringify(history));
        this.renderHistoryTable();
    }

    renderHistoryTable() {
        const tbody = document.getElementById('historyTableBody');
        if (!tbody) return;
        const history = this.getHistory();

        if (history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:20px;color:var(--text-secondary);">No records saved yet.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        history.forEach((r, i) => {
            const tr = document.createElement('tr');
            if (i % 2 === 1) tr.style.background = 'rgba(255,255,255,0.02)';
            tr.innerHTML = `
                <td style="white-space:nowrap;font-size:11px;color:var(--text-secondary);">${r.date || '-'}</td>
                <td style="font-weight:600;white-space:nowrap;">${r.vessel || '-'}</td>
                <td style="text-align:center;">${r.port || '-'}</td>
                <td style="text-align:center;color:#f59e0b;font-weight:bold;">${r.dis || '-'}</td>
                <td style="text-align:center;color:#22c55e;font-weight:bold;">${r.lod || '-'}</td>
                <td style="text-align:center;color:#ec4899;">${r.twin || '-'}</td>
                <td style="text-align:center;color:#a855f7;">${r.restow || '-'}</td>
                <td style="text-align:center;">${r.berth || '-'}</td>
                <td style="text-align:center;">${r.gang || '-'}</td>
                <td style="text-align:center;">${r.prod || '-'}</td>
                <td style="color:var(--text-secondary);font-size:12px;">${r.memo || ''}</td>
                <td style="text-align:center;">
                    <div style="display:flex;gap:5px;justify-content:center;">
                        <button onclick="sim.loadHistoryData(${r.id})" title="Load Session" style="background:#3b82f6;border:none;color:white;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px;">Load</button>
                        <button onclick="sim.editHistoryRecord(${r.id})" title="Edit Memo/Values" style="background:#eab308;border:none;color:white;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px;">Edit</button>
                        <button onclick="sim.deleteHistoryRecord(${r.id})" title="Delete Record" style="background:transparent;border:1px solid #ef4444;color:#ef4444;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px;">✕</button>
                    </div>
                </td>`;
            tbody.appendChild(tr);
        });
    }

    exportHistoryCSV() {
        const history = this.getHistory();
        if (history.length === 0) { alert('No history records to export.'); return; }
        const headers = ['Date', 'Vessel/Voy', 'Port', 'D', 'L', 'Twin', 'Restow', 'Berth(h)', 'Gang', 'Productivity', 'Memo'];
        const rows = history.map(r => [r.date, r.vessel, r.port, r.dis, r.lod, r.twin, r.restow, r.berth, r.gang, r.prod, r.memo]);
        const csv = [headers, ...rows].map(row => row.map(c => '"' + String(c || '').replace(/"/g, '""') + '"').join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'BayplanHistory_' + new Date().toISOString().slice(0, 10) + '.csv';
        a.click();
        URL.revokeObjectURL(url);
    }

    clearHistory() {
        if (!confirm('Delete ALL history records? This cannot be undone.')) return;
        localStorage.removeItem('bayplanHistory');
        this.renderHistoryTable();
    }

}

// Global instance
window.simulator = new BayplanSimulator();
window.sim = window.simulator; // alias for inline HTML handlers

// Wire History tab: auto-populate form + render table
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        if (tab.getAttribute('data-tab') === 'history') {
            window.sim.populateHistoryForm();
            window.sim.renderHistoryTable();
        }
    });
});

// Render history table on startup (show existing saved records)
window.sim.renderHistoryTable();

