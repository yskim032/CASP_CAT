/**
 * Premium EDI Bayplan Simulator Logic
 */
// Firebase is initialized in index.html (compat mode), available as window.db

const ISO_TYPE_MAPPING = {
    // 20FT Containers
    "2200": "20DV", "2210": "20DV", "22G0": "20DV", "22G1": "20DV", "25G0": "20DV",
    "22T0": "20TK", "22T1": "20TK", "2270": "20TK", "22K2": "20TK",
    "2232": "20RE", "22R0": "20RE", "22R1": "20RE",
    "22P1": "20FL", "22P0": "20FL",
    "22U1": "20OT", "22U0": "20OT",
    "22H0": "20HQ", "22H1": "20HQ",
    "22B0": "20BK", "22B1": "20BK",
    "2250": "20RF",
    "22GP": "20GP", "22PC": "20FR", "22UT": "20OT",

    // 40FT Containers
    "42G0": "40DV", "4310": "40DV", "42G1": "40DV",
    "45G0": "40HC", "4510": "40HC", "45G1": "40HC", "4500": "40HC",
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
        this.selectedOperator = 'ALL';
        this.operators = new Set();
        this.currentListTab = 'dis';
        this.listSortCol = 'index';
        this.listSortAsc = true;

        this.compMasterData = [];
        this.compTargetData = [];
        this.compMasterSort = { col: 'match', asc: false };
        this.compTargetSort = { col: 'match', asc: false };

        this.highlightContainerIds = new Set(); // For Find feature (multiple)
        this.searchedIds = new Set(); // All IDs from last search
        this.selectedContainerId = null; // Specific focus from info panel
        this.activeSimMode = 'A'; // Tracks simulation tab (Mode A or B)
        this.hasRow00 = false; // Auto-detected: true if any container uses ROW 00 position

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

        const oprFilter = document.getElementById('operatorFilter');
        if (oprFilter) oprFilter.addEventListener('change', (e) => {
            this.selectedOperator = e.target.value;
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

        // Simulation Calculation listeners (MODE A)
        ['calcProd', 'calcGang'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => {
                this.calcModeA();
                if (this._lastChartData) this.renderGCWorkChart(this._lastChartData);
            });
        });

        // Mode B listeners
        ['calcTargetBerth', 'calcBProd', 'calcBGang'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => {
                this.autoCalcModeB();
                if (this._lastChartData) this.renderGCWorkChart(this._lastChartData);
            });
        });

        // Recommended Gang Apply button
        const btnRec = document.getElementById('btnApplyRecGang');
        if (btnRec) {
            btnRec.addEventListener('click', () => {
                const recVal = document.getElementById('outRecGang')?.textContent;
                const inputGang = document.getElementById('calcGang');
                if (recVal && recVal !== '-' && inputGang) {
                    inputGang.value = recVal;
                    // Trigger update
                    this.calcModeA();
                    if (this._lastChartData && this._lastChartData.length > 0) {
                        this.renderGCWorkChart(this._lastChartData);
                    }
                }
            });
        }

        // Simulation Calculation listeners (MODE B)
        ['calcBProd', 'calcBGang', 'calcTargetBerth'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => this.autoCalcModeB());
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

        const histDateInput = document.getElementById('histDate');
        if (histDateInput) {
            const formatStr = (val) => {
                const numOnly = val.replace(/[^0-9]/g, '');
                if (numOnly.length === 8) {
                    return numOnly.substring(0, 4) + '-' + numOnly.substring(4, 6) + '-' + numOnly.substring(6, 8);
                }
                return val;
            };
            histDateInput.addEventListener('input', function (e) {
                const raw = this.value.replace(/[^0-9-]/g, '');
                const numOnly = raw.replace(/[^0-9]/g, '');
                if (numOnly.length === 8 && !raw.includes('-')) {
                    this.value = formatStr(raw);
                }
            });
            histDateInput.addEventListener('blur', function (e) {
                this.value = formatStr(this.value);
            });
        }

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
                        podr: '',  // LOC+6  port of discharge receipt
                        fullEmpty: '?',
                        weight: null,
                        temp: null,
                        dg: null,
                        oog: false, // Out of Gauge flag (DIM+7 or DIM+8)
                        opr: '',   // operator/carrier code
                        isRestow: false
                    };

                } else if (locType === '9') {
                    if (currentContainer) {
                        let portCode = (parts[2] || '').split(':')[0].trim();
                        // Normalize known typos/aliases
                        if (portCode === 'KRBUS') portCode = 'KRPUS';
                        currentContainer.pol = portCode;
                        const krPorts = ['KRPUS', 'KRKAN', 'KRINC'];
                        if (krPorts.includes(portCode)) currentContainer.port = portCode;
                        else if (!currentContainer.port) currentContainer.port = portCode;
                    }
                } else if (locType === '11' || locType === '12') {
                    // LOC+11 = Next port of discharge (BAPLIE 2.x)
                    // LOC+12 = Final destination (some carriers use this for POD)
                    if (currentContainer) {
                        let pod = (parts[2] || '').split(':')[0].trim();
                        if (pod === 'KRBUS') pod = 'KRPUS';
                        if (!currentContainer.pod || locType === '11') {
                            currentContainer.pod = pod;
                        }
                    }
                } else if (locType === '6') {
                    if (currentContainer) {
                        let podr = (parts[2] || '').split(':')[0].trim();
                        if (podr === 'KRBUS') podr = 'KRPUS';
                        currentContainer.podr = podr;
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
                else if (typeCode.startsWith('4')) currentContainer.size = 40;
                else if (typeCode.startsWith('L') || typeCode.startsWith('l')) currentContainer.size = 45;
                else currentContainer.size = 40; // Fallback to 40 if unknown starting char
                // Last element: 5 = Full, 4 = Empty
                const last = (parts[parts.length - 1] || '').trim();
                currentContainer.fullEmpty = last === '5' ? 'F' : last === '4' ? 'E' : '?';
            }

            // MEA+VGM++KGM:34200 or MEA+WT++KGM:3084 → weight in tons
            if (tag === 'MEA' && currentContainer) {
                const qual = (parts[1] || '').trim();
                // VGM, WT (Weight), AAW (Gross weight), AAU (Actual weight), G (Gross), NW (Net weight)
                if (qual === 'VGM' || qual === 'WT' || qual === 'AAW' || qual === 'AAU' || qual === 'G' || qual === 'NW') {
                    const wgtPart = (parts[3] || '').trim();
                    const wgtStr = wgtPart.includes(':') ? wgtPart.split(':')[1] : wgtPart;
                    if (wgtStr && !isNaN(parseFloat(wgtStr))) {
                        const wgtKg = parseFloat(wgtStr);
                        // Standard rounding to 1 decimal place: 3084 KGM / 1000 -> 3.084 T -> 3.1 T
                        currentContainer.weight = (Math.round(wgtKg / 100) / 10).toFixed(1);
                    }
                }
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

            // DIM+8+CMT::xxx or DIM+7+CMT::xxx → Out of Gauge
            if (tag === 'DIM' && currentContainer) {
                const qualifier = (parts[1] || '').trim();
                if (qualifier === '7' || qualifier === '8') {
                    currentContainer.oog = true;
                }
            }

            // ──────────────────────────────────────────────
            // NAD: Party — extract carrier/operator code
            // NAD+CA+ZIM:172:20  → ZIM  (per-container level)
            // NAD+MS+ZIM:172:20  → ZIM  (some files use MS = message sender)
            // ──────────────────────────────────────────────
            if (tag === 'NAD') {
                const qualifier = (parts[1] || '').trim();
                if (qualifier === 'CA' || qualifier === 'MS' || qualifier === 'CZ') {
                    // C082 composite: party id + code qualifier + agency
                    // Also try C080 (parts[4]) if C082 is empty
                    const fromC082 = (parts[2] || '').split(':')[0].trim();
                    const fromC080 = (parts[4] || '').split(':')[0].trim();
                    const code = fromC082 || fromC080;
                    if (code) {
                        if (currentContainer) {
                            // Per-container operator — override
                            currentContainer.opr = code;
                        }
                    }
                }
            }
        });

        // Push the last container
        if (currentContainer) containers.push(currentContainer);

        // GLOBAL FALLBACK: if containers have no per-container opr set,
        // try to find a header-level NAD+CA (appears before any LOC+147)
        // and assign it to all containers that still have no operator.
        let headerOperator = '';
        for (const rawSeg of segments) {
            const seg = rawSeg.trim();
            const parts = seg.split('+');
            const tag = parts[0];
            // Stop looking once we hit the first container position
            if (tag === 'LOC' && (parts[1] || '').trim() === '147') break;
            if (tag === 'NAD') {
                const qualifier = (parts[1] || '').trim();
                if (qualifier === 'CA' || qualifier === 'MS' || qualifier === 'CZ') {
                    const fromC082 = (parts[2] || '').split(':')[0].trim();
                    const fromC080 = (parts[4] || '').split(':')[0].trim();
                    const code = fromC082 || fromC080;
                    if (code) { headerOperator = code; break; }
                }
            }
        }
        if (headerOperator) {
            containers.forEach(c => { if (!c.opr) c.opr = headerOperator; });
        }

        // Return everything that has a valid 6-digit position
        const valid = containers.filter(c => c.pos && c.pos.length === 6 && /^\d{6}$/.test(c.pos));
        console.log(`[parseEDI] total segments: ${segments.length}, containers found: ${containers.length}, valid: ${valid.length}`);
        return valid;
    }

    updateUI() {
        this.processRestows();
        this.updateOperatorList();
        // Auto-detect ROW 00 type: if any container sits at row '00', use Type A layout
        const allCtrs = [...this.disContainers, ...this.lodContainers];
        this.hasRow00 = allCtrs.some(c => c.pos.substring(2, 4) === '00');
        this.vesselProfile = null; // Reset so it recalculates with correct hasRow00
        this.renderRecap();
        this.renderGeneralStowage();
        if (this.currentListTab) this.renderContainerList(this.currentListTab);
    }

    updateOperatorList() {
        const s = new Set();
        [...this.disContainers, ...this.lodContainers].forEach(c => { if (c.opr) s.add(c.opr); });
        this.operators = s;
        const sel = document.getElementById('operatorFilter');
        if (!sel) return;
        const cur = sel.value;
        sel.innerHTML = '<option value="ALL">ALL Operators</option>';
        Array.from(s).sort().forEach(o => {
            const opt = document.createElement('option');
            opt.value = o; opt.textContent = o; sel.appendChild(opt);
        });
        if (Array.from(s).includes(cur)) sel.value = cur;
        else { sel.value = 'ALL'; this.selectedOperator = 'ALL'; }
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
        let currentWrapper = null;
        let currentWrapperType = null;

        for (let k = 1; k <= 60; k++) {
            const b1 = 4 * k - 3; // FWD 20' odd
            const b2 = 4 * k - 2; // 40' even
            const b3 = 4 * k - 1; // AFT 20' odd

            if (b1 > maxBay + 4) break;
            const hasAny = existingNums.has(b1) || existingNums.has(b2) || existingNums.has(b3);
            if (!hasAny) continue;

            const gk = String(b2).padStart(2, '0');
            const isLong = this._longGangMap && this._longGangMap.has(gk);
            const isShort = this._shortGangMap && this._shortGangMap.has(gk);
            const type = isLong ? 'long' : (isShort ? 'short' : null);

            if (type !== currentWrapperType) {
                if (currentWrapper) {
                    container.appendChild(currentWrapper);
                }
                if (type) {
                    currentWrapper = document.createElement('div');
                    const color = type === 'long' ? '#ef4444' : '#22c55e';
                    const letter = type === 'long' ? 'L' : 'S';
                    currentWrapper.style.cssText = `display:flex; border: 2px solid ${color}; position:relative; padding:4px; padding-left:0; border-radius:6px;`;
                    currentWrapper.innerHTML = `<div style="position:absolute; top:-12px; right:-12px; width:24px; height:24px; border-radius:50%; background:${color}; color:white; font-size:13px; font-weight:bold; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(0,0,0,0.5); z-index:10;">${letter}</div>`;
                } else {
                    currentWrapper = null;
                }
                currentWrapperType = type;
            }

            const hatchDiv = document.createElement('div');
            hatchDiv.className = 'hatch-column';
            if (currentWrapper && currentWrapper.children.length === 1) { // includes only badge initially
                hatchDiv.style.borderLeft = 'none';
                hatchDiv.style.paddingLeft = '4px';
            }

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

            if (hatchDiv.children.length > 0) {
                if (currentWrapper) {
                    currentWrapper.appendChild(hatchDiv);
                } else {
                    container.appendChild(hatchDiv);
                }
            }
        }

        if (currentWrapper) {
            container.appendChild(currentWrapper);
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
        if (this.hasRow00) {
            // Type A: ROW 00 = center (index 15)
            // Even rows (02,04...) = port/left:  02->14, 04->13 ...
            // Odd  rows (01,03...) = stbd/right: 01->16, 03->17 ...
            if (row === 0) return 15;
            if (row % 2 === 0) return 15 - (row / 2);
            return 15 + Math.ceil(row / 2);
        } else {
            // Type B: no ROW 00 — gap between ROW 02 (port) and ROW 01 (stbd)
            // Even rows (02,04...) = port/left:  02->15, 04->14, 06->13 ...
            // Odd  rows (01,03...) = stbd/right: 01->16, 03->17, 05->18 ...
            if (row % 2 === 0) return 16 - (row / 2);
            return 15 + Math.ceil(row / 2);
        }
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
        let dis = this.disContainers;
        let lod = this.lodContainers;

        // Operator filter: if a specific OPR is selected, restrict both lists
        if (this.selectedOperator && this.selectedOperator !== 'ALL') {
            dis = dis.filter(c => c.opr === this.selectedOperator);
            lod = lod.filter(c => c.opr === this.selectedOperator);
        }

        if (this.viewMode === 'dis') return dis;
        if (this.viewMode === 'lod') return lod;

        // Combined logic: Show ALL containers. Target-port matching and Restow
        // highlighting is handled by getColorForContainer() which provides gray fallback.
        const combined = [];
        dis.forEach(c => combined.push(c));
        lod.forEach(c => combined.push(c));

        return combined;
    }

    // Open detailed view for one or more bay codes, with side info panel
    openDetailedBayGroup(bayCodes) {
        if (!this.vesselProfile) {
            let maxROffset = 9; // 5 + 4칸 확장
            let maxTDeck = 13; // 13+1=14 -> Tier 98
            let maxTHold = 13; // 13+1 = 14 -> Tier 30까지 보이도록 설정
            [...this.disContainers, ...this.lodContainers].forEach(c => {
                const rInt = parseInt(c.pos.substring(2, 4) || '0');
                const tInt = parseInt(c.pos.substring(4, 6) || '0');
                let off = 0;
                if (this.hasRow00) {
                    // Type A: center=00(idx15). off = distance from idx 15
                    if (rInt === 0) off = 0;
                    else if (rInt % 2 === 0) off = rInt / 2;       // 02->1, 04->2
                    else off = Math.ceil(rInt / 2);                  // 01->1, 03->2
                } else {
                    // Type B: innermost=02(idx15)/01(idx16). off = distance from idx 15
                    if (rInt % 2 === 0) off = Math.max(0, rInt / 2 - 1);  // 02->0, 04->1
                    else off = Math.ceil(rInt / 2);                          // 01->1, 03->2
                }
                if (off > maxROffset) maxROffset = off;
                if (tInt >= 70) {
                    const tidx = Math.floor((tInt - 70) / 2);
                    if (tidx > maxTDeck) maxTDeck = tidx;
                } else {
                    const tidx = Math.floor((tInt - 2) / 2);
                    if (tidx > maxTHold) maxTHold = tidx;
                }
            });
            this.vesselProfile = {
                maxRowOffset: Math.min(14, maxROffset + 1), // 최대로 가도 14를 넘지 않음 (15가 좌측끝)
                maxTierDeck: Math.min(24, maxTDeck + 1),
                maxTierHold: Math.min(24, maxTHold + 1)
            };
        }

        this.currentBayGroupCodes = bayCodes;

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
        scrollArea.style.cssText = 'flex:1; overflow:auto; display:block; text-align:center; height:100%; cursor:grab; box-sizing:border-box; padding:20px 0; background:#f8f4ec; border-radius:6px;';

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

        // Info panel (Initialize with current selection/highlight state)
        const infoPanel = document.createElement('div');
        infoPanel.id = 'ctrInfoPanel';
        infoPanel.style.cssText = 'width:240px;flex-shrink:0;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:14px;position:sticky;top:0;max-height:85vh;overflow-y:auto;scrollbar-width:thin;';

        if (this.highlightContainerIds && this.highlightContainerIds.size > 0) {
            this.showMultiContainerInfo(Array.from(this.highlightContainerIds), infoPanel);
        } else if (this.selectedContainerId) {
            const selC = this.getAllVisibleContainers().find(x => x.id === this.selectedContainerId);
            if (selC) {
                this.showContainerInfo(selC, infoPanel);
            } else {
                infoPanel.innerHTML = `<div style="color:var(--text-secondary);font-size:13px;text-align:center;padding:20px 0;">Click a container<br>to see details</div>`;
            }
        } else {
            infoPanel.innerHTML = `<div style="color:var(--text-secondary);font-size:13px;text-align:center;padding:20px 0;">Click a container<br>to see details</div>`;
        }

        bayCodes.forEach(bayCode => {
            const baySection = document.createElement('div');
            baySection.style.cssText = 'flex:0 0 auto;';

            const h = document.createElement('h3');
            h.textContent = `BAY ${bayCode}${parseInt(bayCode) % 2 === 0 ? " (40')" : ''}`;
            h.style.cssText = 'font-size:18px;color:#000;font-weight:900;text-align:center;margin-bottom:8px;';
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

        // 사용자 요청에 따라 기본 사이즈를 80%로 고정
        let scale = 0.8;

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
        wrapper.innerHTML = `<p style="font-size:12px;color:#000;font-weight:bold;margin-bottom:3px;">${label}</p>`;

        const grid = document.createElement('div');
        grid.className = 'grid-section';

        const profile = this.vesselProfile || { maxRowOffset: 14, maxTierDeck: 24, maxTierHold: 24 };
        const rStart = 15 - profile.maxRowOffset;
        const rEnd = 15 + profile.maxRowOffset;
        const colsCount = (rEnd - rStart + 1);

        const maxT = isHold ? profile.maxTierHold : profile.maxTierDeck;
        const rowsCount = maxT + 1;

        grid.style.cssText = `display: grid; grid-template-columns: repeat(${colsCount}, 18px) 32px; grid-template-rows: repeat(${rowsCount}, 18px) 16px; gap: 1px;`;

        for (let t = maxT; t >= 0; t--) {
            for (let r = rStart; r <= rEnd; r++) {
                const rowCode = this.colIdxToRowCode(r);
                const slot = document.createElement('div');
                const isCenterCol = this.hasRow00
                    ? (rowCode === '00')
                    : (rowCode === '01' || rowCode === '02');
                slot.className = 'slot' + (isCenterCol ? ' center-col' : '');
                const found = this.checkAndFillSlot(slot, bayCode, r, t, isHold);
                if (found) {
                    slot.style.cursor = 'pointer';
                    slot.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.selectedContainerId = found.id;
                        this.openDetailedBayGroup(this.currentBayGroupCodes);
                    });
                }
                grid.appendChild(slot);
            }
            // Tier label (rightmost column)
            const tierLbl = document.createElement('div');
            tierLbl.className = 'tier-label';
            const tierNum = isHold ? (2 + t * 2) : (70 + t * 2);
            tierLbl.textContent = tierNum.toString().padStart(2, '0');
            grid.appendChild(tierLbl);
        }

        // Bottom row: row-number labels
        for (let r = rStart; r <= rEnd; r++) {
            const code = this.colIdxToRowCode(r);
            const rowLbl = document.createElement('div');
            const isCenterRow = this.hasRow00
                ? (code === '00')
                : (code === '01' || code === '02');
            rowLbl.className = 'row-label' + (isCenterRow ? ' center-row' : '');
            rowLbl.textContent = code;
            grid.appendChild(rowLbl);
        }
        grid.appendChild(document.createElement('div')); // corner blank

        wrapper.appendChild(grid);
        return wrapper;
    }

    // Convert grid column index to maritime row code string
    colIdxToRowCode(r) {
        if (this.hasRow00) {
            // Type A: r=15 → ROW 00 (center), port=even left, stbd=odd right
            if (r === 15) return '00';
            if (r < 15) return ((15 - r) * 2).toString().padStart(2, '0');    // 14->02, 13->04
            return ((r - 15) * 2 - 1).toString().padStart(2, '0');             // 16->01, 17->03
        } else {
            // Type B: r=15 → ROW 02 (innermost port), r=16 → ROW 01 (innermost stbd)
            if (r <= 15) return ((16 - r) * 2).toString().padStart(2, '0');   // 15->02, 14->04
            return ((r - 15) * 2 - 1).toString().padStart(2, '0');             // 16->01, 17->03
        }
    }

    // Show container details in the info panel
    showContainerInfo(c, panel) {
        const feIcon = c.fullEmpty === 'F' ? '🟢 FULL' : c.fullEmpty === 'E' ? '⚪ EMPTY' : '?';
        const mappedType = this.getMappedType(c.type);
        const rows = [
            ['CTR No.', c.id || '-'],
            ['OPR', c.opr || '-'],
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

    // Show multiple containers in the info panel (vertical list)
    showMultiContainerInfo(ids, panel) {
        if (!panel) return;
        panel.innerHTML = `<div style="font-size:13px;font-weight:800;color:#facc15;margin-bottom:15px;padding-bottom:10px;border-bottom:1px solid rgba(250,204,21,0.3);">🔍 Found: ${ids.length} Containers</div>`;

        const containerWrapper = document.createElement('div');
        containerWrapper.style.display = 'flex';
        containerWrapper.style.flexDirection = 'column';
        containerWrapper.style.gap = '25px';

        const allVisible = this.getAllVisibleContainers();
        ids.forEach(id => {
            const c = allVisible.find(x => x.id === id);
            if (!c) return;

            const section = document.createElement('div');
            section.style.cssText = 'background:rgba(255,255,255,0.02); border-radius:6px; padding:10px; border-left:4px solid #facc15; cursor:pointer; transition:all 0.2s;';
            if (this.selectedContainerId === id) {
                section.style.borderLeftColor = '#ef4444';
                section.style.background = 'rgba(239,68,68,0.1)';
            }

            section.addEventListener('click', () => {
                this.selectedContainerId = id;
                this.openDetailedBayGroup(this.currentBayGroupCodes); // re-render grid & panel
            });

            this.showContainerInfo(c, section);
            containerWrapper.appendChild(section);

            // Auto-scroll selected item into view within the panel
            if (this.selectedContainerId === id) {
                setTimeout(() => {
                    section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 50);
            }
        });
        panel.appendChild(containerWrapper);
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

                element.innerHTML = '';
                const mappedType = this.getMappedType(found.type);
                element.title = `${found.id} (${mappedType})\nPort: ${found.port}`;

                if (this.selectedContainerId && found.id === this.selectedContainerId) {
                    // Focus highlight (Red)
                    element.style.outline = '5px solid #ef4444';
                    element.style.outlineOffset = '-2px';
                    element.style.boxShadow = '0 0 25px #ef4444, inset 0 0 10px rgba(0,0,0,0.4)';
                    element.style.zIndex = '20';
                    element.style.position = 'relative';
                    element.style.transform = 'scale(1.25)';
                    element.style.borderRadius = '2px';
                } else if (this.highlightContainerIds && this.highlightContainerIds.has(found.id)) {
                    // Bulk highlight (Yellow)
                    element.style.outline = '4px solid #facc15';
                    element.style.outlineOffset = '-2px';
                    element.style.boxShadow = '0 0 15px #facc15, inset 0 0 8px rgba(0,0,0,0.5)';
                    element.style.zIndex = '10';
                    element.style.position = 'relative';
                    element.style.transform = 'scale(1.15)';
                    element.style.borderRadius = '2px';
                } else if (found.dg) {
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
                element.innerHTML = '';

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

        // Filter strictly to current operational moves (Excluding restows for main boxes)
        const validDis = this.disContainers.filter(c => ((c.pod || c.port) === this.targetPort) && !c.isRestow);
        const validLod = this.lodContainers.filter(c => ((c.pol || c.port) === this.targetPort) && !c.isRestow);

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

        // Calculate and Display Restow Count (from all parsed containers, deduplicated)
        const restowSet = new Set();
        this.disContainers.forEach(c => { if (c.isRestow && c.id) restowSet.add(c.id); });
        this.lodContainers.forEach(c => { if (c.isRestow && c.id) restowSet.add(c.id); });
        document.getElementById('kpiRestowTotal').textContent = restowSet.size;

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

        // Render G/C Work Gantt Chart
        this._lastChartData = chartData;
        this.renderGCWorkChart(chartData);
    }

    // MODE A: Prod + Gangs → Est. Berth Time
    // EST. BERTH TIME = 마지막 갱 종료시간(최대) + 2h prep
    calcModeA() {
        const totalMoves = parseInt(document.getElementById('kpiActualBoxes')?.textContent) || 0;
        const totalBoxes = parseInt(document.getElementById('kpiBoxCount')?.textContent) || 0;
        const prod = parseFloat(document.getElementById('calcProd')?.value);
        const gangs = parseFloat(document.getElementById('calcGang')?.value);
        const outBerth = document.getElementById('outRequiredBerth');
        if (!outBerth) return;
        if (!totalMoves || !prod || !gangs || prod <= 0 || gangs <= 0) { outBerth.textContent = '-'; return; }

        // Calculate est berth time based on G/C chart last gang end time
        let berthTime;
        if (this._lastGangEndTimes && this._lastGangEndTimes.length > 0) {
            const maxEnd = Math.max(...this._lastGangEndTimes);
            berthTime = Math.ceil(maxEnd) + 2;
        } else {
            berthTime = Math.round(totalMoves / (prod * gangs)) + 2;
        }
        outBerth.textContent = berthTime + 'h';

        // Update recommendation & ETB/ETD if input exists
        this.updateRecommendation(totalMoves, prod, totalBoxes);
        this.calcEtbEtd();
    }

    updateRecommendation(totalMoves, prod, totalBoxes) {
        const outRec = document.getElementById('outRecGang');
        const outReason = document.getElementById('recGangReason');
        if (!outRec || !totalMoves || !prod) {
            if (outRec) outRec.textContent = '-';
            return;
        }

        // Count active bay groups
        let bayGroupsCount = 0;
        if (this._lastChartData) {
            const getGroupKey = n => String(Math.ceil((n + 1) / 4) * 4 - 2).padStart(2, '0');
            const groups = new Set();
            this._lastChartData.filter(b => (b.d + b.l) > 0).forEach(b => {
                groups.add(getGroupKey(parseInt(b.bay)));
            });
            bayGroupsCount = groups.size;
        }

        if (bayGroupsCount === 0) {
            outRec.textContent = '-';
            if (outReason) outReason.textContent = 'No active bays found';
            return;
        }

        // Logic: 
        // 1. Minimum 1 gang
        // 2. Maximum: 1 gang per active bay group (cannot do more since one group = one GC zone)
        // 3. Goal: roughly 12-16 hours of work (excluding prep)
        // moves / (prod * gangs) = targetHrs (e.g. 14) -> gangs = moves / (prod * 14)
        const targetHrs = 14;
        let recommended = Math.ceil(totalMoves / (prod * targetHrs));

        // Clamp between 1 and total active bay groups
        const finalRec = Math.min(bayGroupsCount, Math.max(1, recommended));

        outRec.textContent = finalRec;
        if (outReason) {
            if (finalRec === bayGroupsCount && recommended > bayGroupsCount) {
                outReason.textContent = `Limited to max ${bayGroupsCount} active bays`;
            } else {
                outReason.textContent = `Balanced workload for ~${targetHrs}h duration`;
            }
        }

        // Render the detailed statistics table for 1~9 gangs
        this.renderGangEfficiencyTable(totalMoves, prod, bayGroupsCount, totalBoxes);
    }

    renderGangEfficiencyTable(totalMoves, prod, bayGroupsCount, totalBoxes) {
        const container = document.getElementById('gangSimTable');
        if (!container) return;

        const formatXDWH = (h) => {
            const d = Math.floor(h / 24);
            const rh = Math.round(h % 24);
            return d > 0 ? d + 'D ' + rh + 'H' : rh + 'H';
        };

        let bestGang = -1;
        let minRange = Infinity;

        const sims = [];
        for (let g = 1; g <= 9; g++) {
            const estTime = Math.round(totalMoves / (prod * g)) + 2;
            const netHrs = Math.max(0.5, estTime - 2);

            // Productivity (moves/hr per gang)
            // If totalBoxes is 0, we'll just show moves
            const prodBox = totalBoxes ? (totalBoxes / (g * netHrs)) : (totalMoves / (g * netHrs));
            const prodMove = totalMoves / (g * netHrs);

            // Calculate imbalance if data exists
            let range = 0;
            if (this._lastChartData && bayGroupsCount > 0) {
                const activeData = this._lastChartData.filter(b => (b.d + b.l) > 0);
                const getGroupKey = n => String(Math.ceil((n + 1) / 4) * 4 - 2).padStart(2, '0');
                const groupMap = {};
                activeData.forEach(b => {
                    const gk = getGroupKey(parseInt(b.bay));
                    if (!groupMap[gk]) groupMap[gk] = { moves: 0 };
                    groupMap[gk].moves += (b.d + b.l);
                });
                const bayGroups = Object.values(groupMap);
                const gCount = Math.min(g, bayGroups.length);
                const gangMoves = Array(gCount).fill(0);
                let currentIdx = 0;
                for (let i = 0; i < gCount; i++) {
                    const sectionSize = Math.floor(bayGroups.length / gCount) + (i < (bayGroups.length % gCount) ? 1 : 0);
                    const section = bayGroups.slice(currentIdx, currentIdx + sectionSize);
                    gangMoves[i] = section.reduce((sum, bg) => sum + bg.moves, 0);
                    currentIdx += sectionSize;
                }
                const times = gangMoves.map(m => m / prod);
                range = Math.max(...times) - Math.min(...times);

                if (range < minRange && g <= bayGroupsCount) {
                    minRange = range;
                }
            }

            sims.push({ g, timeStr: formatXDWH(estTime), prodBox, prodMove });
        }

        // Current assigned gang count (from input)
        const assignedGang = parseInt(document.getElementById('calcGang')?.value) || -1;

        let html = `
            <table style="width:100%; border-collapse:collapse; font-size:10px; color:var(--text-secondary);">
                <thead>
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
                        <th style="text-align:left; padding:6px 4px;">Gangs</th>
                        <th style="text-align:center; padding:6px 4px;">Est. Time</th>
                        <th style="text-align:center; padding:6px 4px;">Productivity (Box/Mvs)</th>
                    </tr>
                </thead>
                <tbody>`;

        sims.forEach(s => {
            const isHighlighted = (s.g === assignedGang);
            const rowStyle = isHighlighted
                ? 'background:rgba(251,191,36,0.15); border:1px solid rgba(251,191,36,0.7);'
                : '';
            html += `
                <tr style="${rowStyle}">
                    <td style="padding:6px 8px; font-weight:${isHighlighted ? '900' : 'normal'}; color:${isHighlighted ? '#fbbf24' : 'inherit'};">${s.g}</td>
                    <td style="text-align:center; padding:6px 4px; font-weight:${isHighlighted ? '800' : 'normal'}; color:${isHighlighted ? '#fbbf24' : 'inherit'};">${s.timeStr}</td>
                    <td style="text-align:center; padding:6px 4px;">
                        <span style="color:#22c55e;">${s.prodBox.toFixed(1)}</span> / 
                        <span style="color:#38bdf8;">${s.prodMove.toFixed(1)}</span>
                    </td>
                </tr>`;
        });

        html += `</tbody></table>`;
        container.innerHTML = html;
    }

    // MODE B: real-time auto-calc
    autoCalcModeB() {
        const totalMoves = parseInt(document.getElementById('kpiActualBoxes')?.textContent) || 0;
        const targetBerth = parseFloat(document.getElementById('calcTargetBerth')?.value);
        const bProdVal = document.getElementById('calcBProd')?.value.trim();
        const bGangVal = document.getElementById('calcBGang')?.value.trim();
        const bProd = parseFloat(bProdVal);
        const bGang = parseFloat(bGangVal);
        const outResult = document.getElementById('outRequiredGang');
        const outSubLbl = document.getElementById('outRequiredProd');
        if (!outResult) return;
        if (!totalMoves || !targetBerth || targetBerth <= 2) {
            outResult.textContent = '-';
            if (outSubLbl) outSubLbl.textContent = 'Target Berth Time이 2h 초과여야 합니다.';
            return;
        }
        const effectiveHours = targetBerth - 2;
        const hasProd = bProdVal !== '' && !isNaN(bProd) && bProd > 0;
        const hasGang = bGangVal !== '' && !isNaN(bGang) && bGang > 0;
        if (hasProd && !hasGang) {
            outResult.textContent = Math.ceil(totalMoves / (bProd * effectiveHours)) + ' Gang(s)';
            if (outSubLbl) outSubLbl.textContent = `Productivity ${bProd} mvs/hr 기준`;
        } else if (!hasProd && hasGang) {
            outResult.textContent = (totalMoves / (bGang * effectiveHours)).toFixed(1) + ' mvs/hr/gang';
            if (outSubLbl) outSubLbl.textContent = `${bGang} Gang(s) 기준 필요 생산성`;
        } else {
            outResult.textContent = '-';
            if (outSubLbl) outSubLbl.textContent = hasProd && hasGang ? '⚠ 하나만 입력하세요' : 'Productivity 또는 Gangs를 입력하세요.';
        }
    }

    // Render G/C Work Gantt Chart
    // X = bay groups, Y = time reversed (00:00 at bottom), GC sections fixed
    renderGCWorkChart(chartData) {
        // Source gang count from the active mode
        let gangCount = 0;
        let prodVal = 0;

        if (this.activeSimMode === 'B') {
            const bGang = parseInt(document.getElementById('calcBGang')?.value);
            const bProd = parseFloat(document.getElementById('calcBProd')?.value);
            // If one is empty in Mode B, we might need to derive it. 
            // For chart rendering, we primarily need gangCount and prod.
            if (!isNaN(bGang) && bGang > 0) {
                gangCount = bGang;
                // If prod is empty, maybe calculate required prod? 
                // But for the chart, simple gang estimation is enough.
                prodVal = bProd || parseFloat(document.getElementById('calcProd')?.value) || 25;
            } else {
                // If gang is empty, use the derived required gangs if available
                const reqGangText = document.getElementById('outRequiredGang')?.textContent || '';
                gangCount = parseInt(reqGangText) || parseInt(document.getElementById('calcGang')?.value) || 3;
                prodVal = bProd || parseFloat(document.getElementById('calcProd')?.value) || 25;
            }
        } else {
            gangCount = parseInt(document.getElementById('calcGang')?.value) || 3;
            prodVal = parseFloat(document.getElementById('calcProd')?.value) || 25;
        }

        const container = document.getElementById('gcWorkChart');
        if (!container) return;
        if (!prodVal || !gangCount || chartData.length === 0) {
            container.innerHTML = '<div style="color:#64748b;padding:20px;font-size:12px;">Productivity / Gang 또는 Mode B 입력을 완료하세요.</div>';
            return;
        }
        container.innerHTML = '';

        // ── 1. Filter & group ────────────────────────────────────────────
        const activeData = chartData.filter(b => (b.d + b.l) > 0);
        if (!activeData.length) { container.innerHTML = '<div style="color:#64748b;padding:20px;">No work data.</div>'; return; }

        const getGroupKey = n => String(Math.ceil((n + 1) / 4) * 4 - 2).padStart(2, '0');
        const groupMap = {};
        activeData.forEach(b => {
            const gk = getGroupKey(parseInt(b.bay));
            if (!groupMap[gk]) groupMap[gk] = { group: gk, d: 0, l: 0, totalTwt: 0, bays: [] };
            groupMap[gk].d += b.d;
            groupMap[gk].l += b.l;
            // totalTwt: twin-adjusted total moves (AFT bays have twin pair savings applied)
            groupMap[gk].totalTwt += (b.twt !== undefined ? b.twt : (b.d + b.l));
            if (!groupMap[gk].bays.includes(b.bay)) groupMap[gk].bays.push(b.bay);
        });
        const bayGroups = Object.values(groupMap).sort((a, b) => parseInt(a.group) - parseInt(b.group));

        // ── 2. GC sections (Evenly distributed) ──────────────────────────
        const totalBays = bayGroups.length;
        const gangCountToUse = Math.min(gangCount, totalBays);
        const gangSections = [];
        let currentIdx = 0;

        for (let i = 0; i < gangCountToUse; i++) {
            // Distribute remainder among first few gangs
            const sectionSize = Math.floor(totalBays / gangCountToUse) + (i < (totalBays % gangCountToUse) ? 1 : 0);
            gangSections.push(bayGroups.slice(currentIdx, currentIdx + sectionSize));
            currentIdx += sectionSize;
        }
        const actualGangs = gangSections.length;

        // ── 3. Schedule ─────────────────────────────────────────────────
        const scheduled = [];
        const gangEndTimes = Array(actualGangs).fill(0);
        gangSections.forEach((sectionGroups, gi) => {
            let t = 0;
            sectionGroups.filter(g => g.d > 0).forEach(grp => {
                const dur = grp.d / prodVal;
                scheduled.push({ group: grp.group, type: 'D', moves: grp.d, bays: [...grp.bays].sort(), gangId: gi, start: t, end: t + dur, duration: dur });
                t += dur;
            });
            sectionGroups.filter(g => g.l > 0).forEach(grp => {
                const dur = grp.l / prodVal;
                scheduled.push({ group: grp.group, type: 'L', moves: grp.l, bays: [...grp.bays].sort(), gangId: gi, start: t, end: t + dur, duration: dur });
                t += dur;
            });
            gangEndTimes[gi] = t;
        });
        const totalHours = Math.max(...gangEndTimes, 1);

        // Store gang end times for EST. BERTH TIME calculation
        this._lastGangEndTimes = [...gangEndTimes];

        // Re-update EST. BERTH TIME display based on last gang finish + 2h
        const maxEndH = Math.max(...gangEndTimes);
        const newBerthTime = Math.ceil(maxEndH) + 2;
        const outBerth = document.getElementById('outRequiredBerth');
        if (outBerth && gangEndTimes.length > 0) {
            outBerth.textContent = newBerthTime + 'h';
        }
        // Refresh ETB/ETD
        this.calcEtbEtd();

        // ── 4. Color palette: family-based per GC (dark=D, light=L) ─────
        // Each GC uses ONE color family so it's always recognisably the same gang
        const GC_PALETTE = [
            { d: '#ef4444', l: '#fca5a5', label: '#ef4444' },  // GC1: Red family
            { d: '#8b5cf6', l: '#c4b5fd', label: '#a78bfa' },  // GC2: Violet family
            { d: '#f97316', l: '#fdba74', label: '#fb923c' },  // GC3: Orange family
            { d: '#ec4899', l: '#f9a8d4', label: '#f472b6' },  // GC4: Pink family
            { d: '#eab308', l: '#fde047', label: '#fbbf24' },  // GC5: Yellow family
            { d: '#10b981', l: '#6ee7b7', label: '#34d399' },  // GC6: Emerald family
        ];

        // ── 5. Summary table ────────────────────────────────────────────
        const toHHMM = h => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

        // Compute per-gang figures for productivity display
        const gangStats = gangSections.map((sec, gi) => {
            // Total Figure: pure container count (no twin deduction)
            const gcTotalFigure = sec.reduce((s, g) => s + g.d + g.l, 0);
            // Total Moves: twin-adjusted (sum of bay-level twt inside this gang's sections)
            const gcTotalMoves = sec.reduce((s, g) => s + (g.totalTwt !== undefined ? g.totalTwt : g.d + g.l), 0);
            const hrs = gangEndTimes[gi];
            const prodMove = hrs > 0 ? gcTotalMoves / hrs : 0;
            const prodFigure = hrs > 0 ? gcTotalFigure / hrs : 0;
            return { gcTotalMoves, gcTotalFigure, hrs, prodMove, prodFigure };
        });

        let maxHrs = -1;
        let minHrs = Infinity;
        gangStats.forEach(st => {
            if (st.hrs > maxHrs) maxHrs = st.hrs;
            if (st.hrs < minHrs) minHrs = st.hrs;
        });

        this._longGangMap = new Map();
        this._shortGangMap = new Map();
        if (gangStats.length > 1 && maxHrs > minHrs) {
            gangStats.forEach((st, gi) => {
                const pal = GC_PALETTE[gi % GC_PALETTE.length];
                if (st.hrs === maxHrs) {
                    gangSections[gi].forEach(sg => this._longGangMap.set(sg.group, pal.label));
                } else if (st.hrs === minHrs) {
                    gangSections[gi].forEach(sg => this._shortGangMap.set(sg.group, pal.label));
                }
            });
        }

        // Average productivity across all gangs (weighted by hours)
        const allHrs = gangStats.reduce((s, g) => s + g.hrs, 0);
        const allMoves = gangStats.reduce((s, g) => s + g.gcTotalMoves, 0);
        const allFigure = gangStats.reduce((s, g) => s + g.gcTotalFigure, 0);
        const avgProdMove = allHrs > 0 ? allMoves / allHrs : 0;
        const avgProdFigure = allHrs > 0 ? allFigure / allHrs : 0;

        // Update title in index.html with average productivity
        const gcWorkTitle = document.getElementById('gcWorkDistTitle');
        if (gcWorkTitle) {
            gcWorkTitle.innerHTML = `G/C Work Distribution
                <span style="margin-left:14px; font-size:11px; font-weight:400; color:var(--text-secondary);">
                    Avg Productivity:
                    <span style="color:#38bdf8; font-weight:700; margin-left:4px;">Move ${avgProdMove.toFixed(1)}</span>
                    <span style="color:rgba(255,255,255,0.3); margin:0 4px;">/</span>
                    <span style="color:#22c55e; font-weight:700;">Figure ${avgProdFigure.toFixed(1)}</span>
                    <span style="color:rgba(255,255,255,0.35); font-size:10px; margin-left:2px;">(mvs/hr)</span>
                </span>`;
        }

        const summaryWrap = document.createElement('div');
        summaryWrap.style.cssText = `margin-bottom:12px; border-radius:8px; overflow:hidden;
            border:1px solid rgba(255,255,255,0.08); background:#0a1420;`;

        const tbl = document.createElement('table');
        tbl.style.cssText = `width:100%; border-collapse:collapse; font-size:12px; font-family:'Inter',sans-serif;`;
        tbl.innerHTML = `<thead><tr style="background:#0d1628;">
            <th style="padding:8px 12px;text-align:left;color:#64748b;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">GC</th>
            <th style="padding:8px 12px;text-align:center;color:#64748b;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Bay Groups</th>
            <th style="padding:8px 12px;text-align:center;color:#64748b;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Total Moves</th>
            <th style="padding:8px 12px;text-align:center;color:#64748b;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Total Figure</th>
            <th style="padding:8px 12px;text-align:center;color:#64748b;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Working Time</th>
            <th style="padding:8px 12px;text-align:center;color:#64748b;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Work Hrs</th>
            <th style="padding:8px 12px;text-align:center;color:#64748b;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Prod (Move)</th>
            <th style="padding:8px 12px;text-align:center;color:#64748b;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Prod (Figure)</th>
        </tr></thead>`;

        const tbody = document.createElement('tbody');
        gangSections.forEach((sec, gi) => {
            const { gcTotalMoves, gcTotalFigure, hrs, prodMove, prodFigure } = gangStats[gi];
            const pal = GC_PALETTE[gi % GC_PALETTE.length];

            let rowStyle = 'border-top:1px solid rgba(255,255,255,0.05);';
            if (gangStats.length > 1 && maxHrs > minHrs) {
                if (hrs === maxHrs) {
                    rowStyle = 'border-top:1px solid rgba(239, 68, 68, 0.4); border-bottom:1px solid rgba(239, 68, 68, 0.4); background:rgba(239, 68, 68, 0.1);';
                } else if (hrs === minHrs) {
                    rowStyle = 'border-top:1px solid rgba(34, 197, 94, 0.4); border-bottom:1px solid rgba(34, 197, 94, 0.4); background:rgba(34, 197, 94, 0.1);';
                }
            }

            const tr = document.createElement('tr');
            tr.style.cssText = rowStyle;
            tr.innerHTML = `
                <td style="padding:7px 12px;color:${pal.label};font-weight:800;font-size:13px;">GC ${gi + 1}</td>
                <td style="padding:7px 12px;text-align:center;color:#e2e8f0;">${sec.length}</td>
                <td style="padding:7px 12px;text-align:center;color:#e2e8f0;font-weight:700;">${gcTotalMoves}</td>
                <td style="padding:7px 12px;text-align:center;color:#a78bfa;font-weight:700;">${gcTotalFigure}</td>
                <td style="padding:7px 12px;text-align:center;color:#94a3b8;">${toHHMM(hrs)}</td>
                <td style="padding:7px 12px;text-align:center;color:#fbbf24;font-weight:700;">${hrs.toFixed(1)}h</td>
                <td style="padding:7px 12px;text-align:center;color:#38bdf8;font-weight:700;">${prodMove.toFixed(1)}</td>
                <td style="padding:7px 12px;text-align:center;color:#22c55e;font-weight:700;">${prodFigure.toFixed(1)}</td>`;
            tbody.appendChild(tr);
        });
        tbl.appendChild(tbody);
        summaryWrap.appendChild(tbl);
        container.appendChild(summaryWrap);

        // ── 6. Layout constants ──────────────────────────────────────────
        const PX_PER_HOUR = 52;
        const TIME_W = 52;
        const NUM_COLS = bayGroups.length;
        const getColW = (n = 1) => `calc(${n} * (100% - ${TIME_W}px) / ${NUM_COLS})`;
        const getLeft = (ci) => `calc(${TIME_W}px + ${ci} * (100% - ${TIME_W}px) / ${NUM_COLS})`;

        const GC_HDR_H = 24;
        const BAY_HDR_H = 28;
        const HEADER_H = GC_HDR_H + BAY_HDR_H;
        const GRID_H = Math.ceil(totalHours + 0.5) * PX_PER_HOUR;

        const isLastInSec = ci => {
            let acc = 0;
            for (let g = 0; g < gangSections.length; g++) {
                acc += gangSections[g].length;
                if (ci === acc - 1) return true;
            }
            return false;
        };

        // ── 7. Build DOM ─────────────────────────────────────────────────
        // Outer wrapper: Full width, vertical scroll handled by the page
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `overflow:hidden; width:100%; background:#080e1c;
            border-radius:8px; border:1px solid rgba(255,255,255,0.1);
            font-family:'Inter',monospace,sans-serif;`;

        // ── Sticky 2-row header ──
        const stickyHdr = document.createElement('div');
        stickyHdr.style.cssText = `position:sticky; top:0; z-index:20; width:100%;
            background:#0c1424; border-bottom:2px solid rgba(255,255,255,0.18);`;

        // Row 1: GC labels
        const gcRow = document.createElement('div');
        gcRow.style.cssText = `display:flex; height:${GC_HDR_H}px; border-bottom:1px solid rgba(255,255,255,0.1);`;
        const gcCorner = document.createElement('div');
        gcCorner.style.cssText = `width:${TIME_W}px; flex-shrink:0; border-right:1px solid rgba(255,255,255,0.12);`;
        gcRow.appendChild(gcCorner);
        gangSections.forEach((sec, gi) => {
            const pal = GC_PALETTE[gi % GC_PALETTE.length];
            const cell = document.createElement('div');
            cell.style.cssText = `width:${getColW(sec.length)}; flex-shrink:0;
                display:flex; align-items:center; justify-content:center;
                font-size:11px; font-weight:800; color:${pal.label}; letter-spacing:.07em;
                border-right:2px solid rgba(255,255,255,0.18); overflow:hidden; white-space:nowrap;`;
            cell.textContent = `GC ${gi + 1}`;
            gcRow.appendChild(cell);
        });
        stickyHdr.appendChild(gcRow);

        // Row 2: bay group numbers
        const bayHdrRow = document.createElement('div');
        bayHdrRow.style.cssText = `display:flex; height:${BAY_HDR_H}px; background:#0c1424;`;
        const bayCorner = document.createElement('div');
        bayCorner.style.cssText = `width:${TIME_W}px; flex-shrink:0; border-right:1px solid rgba(255,255,255,0.1);`;
        bayHdrRow.appendChild(bayCorner);
        bayGroups.forEach((grp, ci) => {
            const last = isLastInSec(ci);
            const cell = document.createElement('div');
            cell.style.cssText = `width:${getColW()}; flex-shrink:1; min-width:0; display:flex; flex-direction:column;
                align-items:center; justify-content:center; line-height:1.2; overflow:hidden;
                border-right:${last ? '2px solid rgba(255,255,255,0.18)' : '1px solid rgba(255,255,255,0.06)'};`;
            const subBays = grp.bays.sort((a, b) => parseInt(a) - parseInt(b));
            cell.innerHTML = `<span style="font-size:10px;font-weight:800;color:#e2e8f0;">${grp.group}</span>
                <span style="font-size:7px;font-weight:600;color:#cbd5e1;">${subBays.join('/')}</span>`;
            bayHdrRow.appendChild(cell);
        });
        stickyHdr.appendChild(bayHdrRow);
        wrapper.appendChild(stickyHdr);

        // ── Canvas ──
        const canvas = document.createElement('div');
        canvas.style.cssText = `position:relative; width:100%; height:${GRID_H}px;`;

        // Time labels + grid lines
        const maxH = Math.ceil(totalHours + 1);
        for (let h = 0; h <= maxH; h++) {
            const y = GRID_H - h * PX_PER_HOUR;
            if (y < -10 || y > GRID_H + 10) continue;
            const lbl = document.createElement('div');
            lbl.style.cssText = `position:absolute; left:0; top:${y - 9}px;
                width:${TIME_W - 4}px; font-size:10px; font-weight:600; color:#e2e8f0;
                text-align:right; padding-right:6px; box-sizing:border-box;`;
            lbl.textContent = `${String(h).padStart(2, '0')}:00`;
            canvas.appendChild(lbl);
            const line = document.createElement('div');
            line.style.cssText = `position:absolute; left:${TIME_W}px; top:${y}px;
                width:calc(100% - ${TIME_W}px); height:1px;
                background:rgba(255,255,255,${h === 0 ? '0.28' : '0.06'});`;
            canvas.appendChild(line);
        }

        // Vertical column separators
        bayGroups.forEach((grp, ci) => {
            const last = isLastInSec(ci);
            const sep = document.createElement('div');
            sep.style.cssText = `position:absolute; left:${getLeft(ci + 1)}; top:0;
                width:${last ? '2px' : '1px'}; height:${GRID_H}px;
                background:${last ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)'};`;
            canvas.appendChild(sep);
        });

        // Task blocks (Reversed Y: 00:00 at bottom)
        scheduled.forEach(task => {
            const colIdx = bayGroups.findIndex(g => g.group === task.group);
            if (colIdx < 0) return;

            const pal = GC_PALETTE[task.gangId % GC_PALETTE.length];
            const bgColor = task.type === 'D' ? pal.d : pal.l;
            const textColor = task.type === 'D' ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.8)';

            const block = document.createElement('div');
            block.style.cssText = `position:absolute;
                left:calc(${getLeft(colIdx)} + 3px);
                width:calc(${getColW()} - 6px);
                bottom:${task.start * PX_PER_HOUR}px;
                height:${task.duration * PX_PER_HOUR}px;
                background:${bgColor}; border-radius:4px; overflow:hidden; z-index:3;
                cursor:default; box-shadow:0 2px 8px rgba(0,0,0,0.5);
                display:flex; flex-direction:column; border:1px solid rgba(255,255,255,0.2);`;

            block.title = `Bay ${task.group} (${task.bays.join(',')}) | ${task.type === 'D' ? 'Discharge' : 'Load'} | GC${task.gangId + 1}\nMoves: ${task.moves} | ${task.start.toFixed(1)}h → ${task.end.toFixed(1)}h`;

            const lbl = document.createElement('div');
            lbl.style.cssText = `padding:2px 4px; font-size:9px; font-weight:800;
                color:${textColor}; line-height:1.2; white-space:nowrap; overflow:hidden;`;
            lbl.innerHTML = `${task.group}${task.type}-GC${task.gangId + 1}<br>${task.moves}mvs`;
            block.appendChild(lbl);
            canvas.appendChild(block);
        });

        wrapper.appendChild(canvas);
        container.style.height = 'auto';
        container.appendChild(wrapper);
    }

    calcModeB() { this.autoCalcModeB(); }

    // ETB / ETD 계산
    // Input: "YYYYMMDD HHMM" (e.g. "20260305 1600")
    // ETB: parsed datetime
    // ETD: ETB + EST. BERTH TIME (from outRequiredBerth)
    calcEtbEtd() {
        const input = (document.getElementById('etbInput')?.value || '').trim();
        const resultEl = document.getElementById('etbEtdResult');
        if (!resultEl) return;

        if (!input) {
            resultEl.innerHTML = '<span style="color:rgba(255,255,255,0.3);">입항 시간을 입력하면 ETB/ETD가 표시됩니다.</span>';
            return;
        }

        // Parse: YYYYMMDD HHMM (with or without space)
        const cleaned = input.replace(/\s+/g, '');
        if (cleaned.length < 12) {
            resultEl.innerHTML = '<span style="color:#ef4444;">⚠ 형식 오류: "20260305 1600" 형식으로 입력하세요.</span>';
            return;
        }
        const yyyy = cleaned.slice(0, 4);
        const mm = cleaned.slice(4, 6);
        const dd = cleaned.slice(6, 8);
        const hh = cleaned.slice(8, 10);
        const min = cleaned.slice(10, 12);

        const etbDate = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd), parseInt(hh), parseInt(min));
        if (isNaN(etbDate.getTime())) {
            resultEl.innerHTML = '<span style="color:#ef4444;">⚠ 유효하지 않은 날짜입니다.</span>';
            return;
        }

        const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const fmtDate = dt => {
            const h = String(dt.getHours()).padStart(2, '0');
            const m = String(dt.getMinutes()).padStart(2, '0');
            const d = String(dt.getDate()).padStart(2, '0');
            const mo = monthNames[dt.getMonth()];
            const y = dt.getFullYear();
            return `${h}:${m} ${d}/${mo}/${y}`;
        };

        const etbStr = fmtDate(etbDate);

        // Get est. berth hours
        const berthText = document.getElementById('outRequiredBerth')?.textContent || '';
        const berthHours = parseFloat(berthText.replace('h', '').trim());

        if (!berthHours || isNaN(berthHours)) {
            resultEl.innerHTML =
                `<div><span style="color:#fbbf24;font-weight:700;min-width:34px;display:inline-block;">ETB</span> <span style="color:white;font-size:13px;font-weight:800;">${etbStr}</span></div>` +
                `<div style="color:rgba(255,255,255,0.35);font-size:10px;">EST. BERTH TIME을 먼저 계산하세요.</div>`;
            return;
        }

        const etdDate = new Date(etbDate.getTime() + berthHours * 3600 * 1000);
        const etdStr = fmtDate(etdDate);

        resultEl.innerHTML =
            `<div><span style="color:#fbbf24;font-weight:700;min-width:34px;display:inline-block;">ETB</span> <span style="color:white;font-size:13px;font-weight:800;">${etbStr}</span></div>` +
            `<div><span style="color:#f87171;font-weight:700;min-width:34px;display:inline-block;">ETD</span> <span style="color:white;font-size:13px;font-weight:800;">${etdStr}</span> <span style="color:rgba(255,255,255,0.4);font-size:10px;">(+${berthHours}h)</span></div>`;
    }

    switchSimMode(mode) {
        const modeA = document.getElementById('simModeA');
        const modeB = document.getElementById('simModeB');
        const tabA = document.getElementById('modeTabA');
        const tabB = document.getElementById('modeTabB');
        if (!modeA || !modeB) return;

        this.activeSimMode = mode;

        if (mode === 'A') {
            modeA.style.display = 'grid';
            modeB.style.display = 'none';
            if (tabA) {
                tabA.style.border = '1px solid var(--accent-color)';
                tabA.style.background = 'rgba(234,179,8,0.18)';
                tabA.style.color = 'var(--accent-color)';
            }
            if (tabB) {
                tabB.style.border = '1px solid var(--glass-border)';
                tabB.style.background = 'transparent';
                tabB.style.color = 'var(--text-secondary)';
            }
            this.calcModeA();
        } else {
            modeA.style.display = 'none';
            modeB.style.display = 'grid';
            if (tabB) {
                tabB.style.border = '1px solid #38bdf8';
                tabB.style.background = 'rgba(56,189,248,0.15)';
                tabB.style.color = '#38bdf8';
            }
            if (tabA) {
                tabA.style.border = '1px solid var(--glass-border)';
                tabA.style.background = 'transparent';
                tabA.style.color = 'var(--text-secondary)';
            }
            this.autoCalcModeB();
        }

        // Re-render chart to reflect the correct gang count source immediately
        if (this._lastChartData) this.renderGCWorkChart(this._lastChartData);
    }

    // Keep backward compat
    updateSimulationCalc() { this.calcModeA(); }

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
        let fullList = mode === 'dis' ? [...this.disContainers] : [...this.lodContainers];
        if (mode === 'dis') fullList = fullList.filter(c => (c.pod || c.port) === this.targetPort && !c.isRestow);
        else fullList = fullList.filter(c => (c.pol || c.port) === this.targetPort && !c.isRestow);

        // All containers ignoring target port (for "Include All POD" section)
        let allPortList = mode === 'dis'
            ? this.disContainers.filter(c => !c.isRestow)
            : this.lodContainers.filter(c => !c.isRestow);
        if (this.selectedOperator !== 'ALL') {
            allPortList = allPortList.filter(c => c.opr === this.selectedOperator);
        }

        if (this.selectedOperator === 'ALL') {
            // ALL: show one RECAP table grouped by POD, all operators summed
            this.renderListRecap(fullList, mode, 'ALL', allPortList);
        } else {
            // Specific OPR: show filtered RECAP grouped by POD
            const filtered = fullList.filter(c => c.opr === this.selectedOperator);
            this.renderListRecap(filtered, mode, 'SELECTED', allPortList);
        }
        let list = (this.selectedOperator === 'ALL') ? fullList : fullList.filter(c => c.opr === this.selectedOperator);

        // Apply sorting before rendering
        if (this.listSortCol && this.listSortCol !== 'index') {
            list.sort((a, b) => {
                let valA, valB;
                switch (this.listSortCol) {
                    case 'id': valA = a.id || ''; valB = b.id || ''; break;
                    case 'opr': valA = a.opr || ''; valB = b.opr || ''; break;
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
                <td style="text-align:center;color:var(--accent-color);font-weight:700;">${c.opr || '-'}</td>
                <td style="text-align:center;font-family:monospace;">${c.pos || '-'}</td>
                <td style="text-align:center;">${c.size}'</td>
                <td style="text-align:center;">${mappedType || '-'}</td>
                <td>${c.pol || c.port || '-'}</td>
                <td style="color:#f59e0b;font-weight:bold;">${c.podr || c.pod || '-'}</td>
                <td style="color:${feColor};font-weight:600;">${fe}</td>
                <td style="text-align:right;">${c.weight ? c.weight + ' T' : '-'}</td>
                <td style="text-align:center;color:#ef4444;font-weight:600;">${c.dg || ''}</td>
                <td style="text-align:right;color:#38bdf8;">${(c.temp !== undefined && c.temp !== null && c.temp !== '') ? c.temp + '°C' : ''}</td>
            `;
            body.appendChild(tr);
        });
    }

    renderListRecap(list, mode, recapType, allPortList) {
        const container = document.getElementById('listRecapContainer');
        if (!container) return;
        container.innerHTML = '';

        const isAll = (recapType === 'ALL');
        const filterColor = isAll ? '#38bdf8' : '#a855f7';

        const is40HC = (c) => {
            if (c.size !== 40) return false;
            const mapped = this.getMappedType(c.type) || '';
            return mapped.includes('HC') || mapped.includes('HQ') || mapped.includes('HT');
        };

        const generateTableHTML = (title, groupKeyFn, portLabel) => {
            const groups = {};
            list.forEach(c => {
                const key = groupKeyFn(c);
                if (!groups[key]) {
                    groups[key] = {
                        port: key,
                        s20F: 0, s20E: 0, s40F: 0, s40E: 0,
                        s40HF: 0, s40HE: 0, s45F: 0, s45E: 0,
                        rf: 0, dg: 0, oog: 0, weight: 0
                    };
                }
                const g = groups[key];
                const isFull = c.fullEmpty !== 'E';
                const isRF = c.temp !== null && c.temp !== undefined && c.temp !== '';
                const isDG = !!c.dg;
                const isOOG = !!c.oog;

                if (c.size === 20) { isFull ? g.s20F++ : g.s20E++; }
                else if (c.size === 45) { isFull ? g.s45F++ : g.s45E++; }
                else if (is40HC(c)) { isFull ? g.s40HF++ : g.s40HE++; }
                else { isFull ? g.s40F++ : g.s40E++; }

                if (isRF) g.rf++;
                if (isDG) g.dg++;
                if (isOOG) g.oog++;
                if (c.weight) g.weight += parseFloat(c.weight);
            });

            const rows = Object.values(groups).sort((a, b) => {
                const tA = a.s20F + a.s20E + a.s40F + a.s40E + a.s40HF + a.s40HE + a.s45F + a.s45E;
                const tB = b.s20F + b.s20E + b.s40F + b.s40E + b.s40HF + b.s40HE + b.s45F + b.s45E;
                return tB - tA;
            });

            if (rows.length === 0) return '';

            const getTeu = (g) => (g.s20F + g.s20E) + (g.s40F + g.s40E + g.s40HF + g.s40HE + g.s45F + g.s45E) * 2;
            const getTeuE = (g) => g.s20E + (g.s40E + g.s40HE + g.s45E) * 2;

            const th = (t, right) => `<th style="padding:5px 10px;text-align:${right ? 'right' : 'center'};color:var(--text-secondary);font-size:11px;white-space:nowrap;border-bottom:1px solid rgba(255,255,255,0.1);">${t}</th>`;
            const td = (v, accent, right) => `<td style="padding:4px 10px;text-align:${right ? 'right' : 'center'};font-size:11px;white-space:nowrap;${accent ? `color:${accent};font-weight:bold;` : ''}">${v}</td>`;
            const fmtCount = (f, e) => e > 0 ? `${f + e}(${e})` : `${f + e}`;
            const fmtTeu = (teu, teuE) => teuE > 0 ? `${teu}(${teuE})` : `${teu}`;

            let html = `<div style="margin-top:0;;margin-bottom:12px;">
                <div style="font-size:11px;font-weight:800;color:${filterColor};margin-bottom:6px;text-transform:uppercase;">${title}</div>
                <div style="overflow-x:auto;">
                <table class="list-table" style="min-width:100%;border-radius:6px;background:rgba(0,0,0,0.15);margin-bottom:0;border-collapse:collapse;">
                <thead style="background:rgba(255,255,255,0.06);">
                    <tr>
                        ${th(portLabel)}
                        ${th("20'(E)")}
                        ${th("40'(E)")}
                        ${th("40H'(E)")}
                        ${th("45'(E)")}
                        ${th('<span style="color:#38bdf8">RF</span>')}
                        ${th('<span style="color:#ef4444">DG</span>')}
                        ${th('<span style="color:#fb923c">OOG</span>')}
                        ${th('<span style="color:var(--accent-color)">TTL</span>')}
                        ${th('TEU F(E)')}
                        ${th('WEIGHT(T)', true)}
                    </tr>
                </thead>
                <tbody>`;

            let totS20F = 0, totS20E = 0, totS40F = 0, totS40E = 0, tot40HF = 0, tot40HE = 0, tot45F = 0, tot45E = 0;
            let totRF = 0, totDG = 0, totOOG = 0, totWgt = 0;

            rows.forEach((g, i) => {
                const ttl = g.s20F + g.s20E + g.s40F + g.s40E + g.s40HF + g.s40HE + g.s45F + g.s45E;
                const ttlE = g.s20E + g.s40E + g.s40HE + g.s45E;
                const teu = getTeu(g); const teuE = getTeuE(g);
                totS20F += g.s20F; totS20E += g.s20E; totS40F += g.s40F; totS40E += g.s40E;
                tot40HF += g.s40HF; tot40HE += g.s40HE; tot45F += g.s45F; tot45E += g.s45E;
                totRF += g.rf; totDG += g.dg; totOOG += g.oog; totWgt += g.weight;

                html += `<tr style="border-top:1px solid rgba(255,255,255,0.05);${i % 2 === 1 ? 'background:rgba(255,255,255,0.02);' : ''}">
                    ${td('<b>' + g.port + '</b>', null)}
                    ${td(fmtCount(g.s20F, g.s20E), null)}
                    ${td(fmtCount(g.s40F, g.s40E), null)}
                    ${td(fmtCount(g.s40HF, g.s40HE), null)}
                    ${td(fmtCount(g.s45F, g.s45E), null)}
                    ${td(g.rf > 0 ? g.rf : '', g.rf > 0 ? '#38bdf8' : null)}
                    ${td(g.dg > 0 ? g.dg : '', g.dg > 0 ? '#ef4444' : null)}
                    ${td(g.oog > 0 ? g.oog : '', g.oog > 0 ? '#fb923c' : null)}
                    ${td(fmtCount(ttl - ttlE, ttlE), 'var(--accent-color)')}
                    ${td(fmtTeu(teu, teuE), null)}
                    ${td(g.weight > 0 ? g.weight.toFixed(1) : '-', null, true)}
                </tr>`;
            });

            const totTtl = totS20F + totS20E + totS40F + totS40E + tot40HF + tot40HE + tot45F + tot45E;
            const totTtlE = totS20E + totS40E + tot40HE + tot45E;
            const totTeuCalc = (totS20F + totS20E) + (totS40F + totS40E + tot40HF + tot40HE + tot45F + tot45E) * 2;
            const totTeuE = totS20E + (totS40E + tot40HE + tot45E) * 2;

            html += `<tr style="border-top:2px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.35);font-weight:bold;">
                    ${td('<b>TOTAL</b>', null)}
                    ${td(fmtCount(totS20F, totS20E), '#fff')}
                    ${td(fmtCount(totS40F, totS40E), '#fff')}
                    ${td(fmtCount(tot40HF, tot40HE), '#fff')}
                    ${td(fmtCount(tot45F, tot45E), '#fff')}
                    ${td(totRF > 0 ? totRF : '-', totRF > 0 ? '#38bdf8' : '#94a3b8')}
                    ${td(totDG > 0 ? totDG : '-', totDG > 0 ? '#ef4444' : '#94a3b8')}
                    ${td(totOOG > 0 ? totOOG : '-', totOOG > 0 ? '#fb923c' : '#94a3b8')}
                    ${td(fmtCount(totTtl - totTtlE, totTtlE), 'var(--accent-color)')}
                    ${td(fmtTeu(totTeuCalc, totTeuE), '#fff')}
                    ${td(totWgt > 0 ? totWgt.toFixed(1) : '-', null, true)}
                </tr></tbody></table></div></div>`;
            return html;
        };

        const prefix = isAll ? 'ALL OPERATORS' : `SELECTED OPERATOR: ${this.selectedOperator}`;
        let finalHtml = '';

        if (mode === 'dis') {
            // Discharge View: POL is the primary metric
            const getPolKey = (c) => (c.pol || c.port || '-');
            finalHtml += generateTableHTML(`${prefix} (BY POL)`, getPolKey, 'POL');

            const getPodKey = (c) => (c.podr || c.pod || c.port || '-');
            finalHtml += generateTableHTML(`${prefix} (BY POD)`, getPodKey, 'POD');
        } else {
            // Load View: POD is the primary metric
            const getPodKey = (c) => (c.podr || c.pod || '-');
            finalHtml += generateTableHTML(`${prefix} (BY POD)`, getPodKey, 'POD');

            const getPolKey = (c) => (c.pol || c.port || '-');
            finalHtml += generateTableHTML(`${prefix} (BY POL)`, getPolKey, 'POL');
        }

        // "Include All POD" section — target port 무시한 전체 컨테이너
        if (allPortList && allPortList.length > 0) {
            const allPrefix = isAll ? 'ALL OPERATORS' : `SELECTED OPERATOR: ${this.selectedOperator}`;
            // Override filterColor to a distinct amber for this section
            const savedColor = filterColor;
            // Use a helper that renders with a different accent color
            const generateAllPodHTML = (title, groupKeyFn, portLabel) => {
                const groups = {};
                allPortList.forEach(c => {
                    const key = groupKeyFn(c);
                    if (!groups[key]) {
                        groups[key] = {
                            port: key,
                            s20F: 0, s20E: 0, s40F: 0, s40E: 0,
                            s40HF: 0, s40HE: 0, s45F: 0, s45E: 0,
                            rf: 0, dg: 0, oog: 0, weight: 0
                        };
                    }
                    const g = groups[key];
                    const isFull = c.fullEmpty !== 'E';
                    const isRF = c.temp !== null && c.temp !== undefined && c.temp !== '';
                    const isDG = !!c.dg;
                    const isOOG = !!c.oog;
                    if (c.size === 20) { isFull ? g.s20F++ : g.s20E++; }
                    else if (c.size === 45) { isFull ? g.s45F++ : g.s45E++; }
                    else if (is40HC(c)) { isFull ? g.s40HF++ : g.s40HE++; }
                    else { isFull ? g.s40F++ : g.s40E++; }
                    if (isRF) g.rf++;
                    if (isDG) g.dg++;
                    if (isOOG) g.oog++;
                    if (c.weight) g.weight += parseFloat(c.weight);
                });

                const rows = Object.values(groups).sort((a, b) => {
                    const tA = a.s20F + a.s20E + a.s40F + a.s40E + a.s40HF + a.s40HE + a.s45F + a.s45E;
                    const tB = b.s20F + b.s20E + b.s40F + b.s40E + b.s40HF + b.s40HE + b.s45F + b.s45E;
                    return tB - tA;
                });
                if (rows.length === 0) return '';

                const accentColor = '#f59e0b'; // amber for distinction
                const getTeu = (g) => (g.s20F + g.s20E) + (g.s40F + g.s40E + g.s40HF + g.s40HE + g.s45F + g.s45E) * 2;
                const getTeuE = (g) => g.s20E + (g.s40E + g.s40HE + g.s45E) * 2;
                const th = (t, right) => `<th style="padding:5px 10px;text-align:${right ? 'right' : 'center'};color:var(--text-secondary);font-size:11px;white-space:nowrap;border-bottom:1px solid rgba(255,255,255,0.1);">${t}</th>`;
                const td = (v, accent, right) => `<td style="padding:4px 10px;text-align:${right ? 'right' : 'center'};font-size:11px;white-space:nowrap;${accent ? `color:${accent};font-weight:bold;` : ''}">${v}</td>`;
                const fmtCount = (f, e) => e > 0 ? `${f + e}(${e})` : `${f + e}`;
                const fmtTeu = (teu, teuE) => teuE > 0 ? `${teu}(${teuE})` : `${teu}`;

                let html = `<div style="margin-top:0;margin-bottom:12px;">
                    <div style="font-size:11px;font-weight:800;color:${accentColor};margin-bottom:6px;text-transform:uppercase;">${title}</div>
                    <div style="overflow-x:auto;">
                    <table class="list-table" style="min-width:100%;border-radius:6px;background:rgba(0,0,0,0.15);margin-bottom:0;border-collapse:collapse;">
                    <thead style="background:rgba(255,255,255,0.06);">
                        <tr>
                            ${th(portLabel)}
                            ${th("20'(E)")}
                            ${th("40'(E)")}
                            ${th("40H'(E)")}
                            ${th("45'(E)")}
                            ${th('<span style="color:#38bdf8">RF</span>')}
                            ${th('<span style="color:#ef4444">DG</span>')}
                            ${th('<span style="color:#fb923c">OOG</span>')}
                            ${th('<span style="color:var(--accent-color)">TTL</span>')}
                            ${th('TEU F(E)')}
                            ${th('WEIGHT(T)', true)}
                        </tr>
                    </thead>
                    <tbody>`;

                let totS20F = 0, totS20E = 0, totS40F = 0, totS40E = 0, tot40HF = 0, tot40HE = 0, tot45F = 0, tot45E = 0;
                let totRF = 0, totDG = 0, totOOG = 0, totWgt = 0;

                rows.forEach((g, i) => {
                    const ttl = g.s20F + g.s20E + g.s40F + g.s40E + g.s40HF + g.s40HE + g.s45F + g.s45E;
                    const ttlE = g.s20E + g.s40E + g.s40HE + g.s45E;
                    const teu = getTeu(g); const teuE = getTeuE(g);
                    totS20F += g.s20F; totS20E += g.s20E; totS40F += g.s40F; totS40E += g.s40E;
                    tot40HF += g.s40HF; tot40HE += g.s40HE; tot45F += g.s45F; tot45E += g.s45E;
                    totRF += g.rf; totDG += g.dg; totOOG += g.oog; totWgt += g.weight;
                    html += `<tr style="border-top:1px solid rgba(255,255,255,0.05);${i % 2 === 1 ? 'background:rgba(255,255,255,0.02);' : ''}">
                        ${td('<b>' + g.port + '</b>', null)}
                        ${td(fmtCount(g.s20F, g.s20E), null)}
                        ${td(fmtCount(g.s40F, g.s40E), null)}
                        ${td(fmtCount(g.s40HF, g.s40HE), null)}
                        ${td(fmtCount(g.s45F, g.s45E), null)}
                        ${td(g.rf > 0 ? g.rf : '', g.rf > 0 ? '#38bdf8' : null)}
                        ${td(g.dg > 0 ? g.dg : '', g.dg > 0 ? '#ef4444' : null)}
                        ${td(g.oog > 0 ? g.oog : '', g.oog > 0 ? '#fb923c' : null)}
                        ${td(fmtCount(ttl - ttlE, ttlE), 'var(--accent-color)')}
                        ${td(fmtTeu(teu, teuE), null)}
                        ${td(g.weight > 0 ? g.weight.toFixed(1) : '-', null, true)}
                    </tr>`;
                });

                const totTtl = totS20F + totS20E + totS40F + totS40E + tot40HF + tot40HE + tot45F + tot45E;
                const totTtlE = totS20E + totS40E + tot40HE + tot45E;
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
                        ${td(totOOG > 0 ? totOOG : '-', totOOG > 0 ? '#fb923c' : '#94a3b8')}
                        ${td(fmtCount(totTtl - totTtlE, totTtlE), 'var(--accent-color)')}
                        ${td(fmtTeu(totTeu, totTeuE), '#fff')}
                        ${td(totWgt > 0 ? totWgt.toFixed(1) : '-', null, true)}
                    </tr></tbody></table></div></div>`;
                return html;
            };

            const getPodKeyAll = (c) => (c.podr || c.pod || c.port || '-');
            finalHtml += generateAllPodHTML(
                `${allPrefix} (INCLUDE ALL POD)`,
                getPodKeyAll,
                'POD'
            );
        }

        container.innerHTML = finalHtml;
    }

    exportExcel() {
        const mode = this.currentListTab || 'dis';
        const label = mode === 'dis' ? 'Discharge' : 'Load';

        // 1. Data for main list (filtered by target port)
        let fullList = mode === 'dis' ? this.disContainers : this.lodContainers;
        const targetFiltered = fullList.filter(c => {
            const p = (mode === 'dis' ? (c.pod || c.port) : (c.pol || c.port));
            return p === this.targetPort && !c.isRestow;
        });

        const selectedOprOnly = this.selectedOperator === 'ALL'
            ? targetFiltered
            : targetFiltered.filter(c => c.opr === this.selectedOperator);

        const listHeaders = ['#', 'CTR No.', 'OPR', 'Position', 'Size', 'ISO Type', 'POL', 'POD', 'F/E', 'Weight(T)', 'DG', 'Temp(C)'];
        const listRows = selectedOprOnly.map((c, i) => [
            i + 1, c.id || '', c.opr || '', c.pos || '', c.size + "'",
            this.getMappedType(c.type) || '', c.pol || c.port || '', c.pod || '',
            c.fullEmpty === 'F' ? 'FULL' : c.fullEmpty === 'E' ? 'EMPTY' : '',
            c.weight || '', c.dg || '',
            (c.temp !== undefined && c.temp !== null && c.temp !== '') ? c.temp : ''
        ]);

        // Helper to generate recap row data (same logic as UI)
        const getRecapData = (dataList, groupKeyFn) => {
            const groups = {};
            const is40HC = (c) => { const t = this.getMappedType(c.type) || ''; return c.size === 40 && (t.includes('HC') || t.includes('HQ') || t.includes('HT')); };

            dataList.forEach(c => {
                const k = groupKeyFn(c);
                if (!groups[k]) groups[k] = { s20F: 0, s20E: 0, s40F: 0, s40E: 0, s40HF: 0, s40HE: 0, s45F: 0, s45E: 0, rf: 0, dg: 0, wgt: 0 };
                const g = groups[k]; const isFull = c.fullEmpty !== 'E';
                if (c.size === 20) { isFull ? g.s20F++ : g.s20E++; }
                else if (c.size === 45) { isFull ? g.s45F++ : g.s45E++; }
                else if (is40HC(c)) { isFull ? g.s40HF++ : g.s40HE++; }
                else { isFull ? g.s40F++ : g.s40E++; }
                if (c.temp !== undefined && c.temp !== null && c.temp !== '') g.rf++;
                if (c.dg) g.dg++;
                if (c.weight) g.wgt += parseFloat(c.weight);
            });

            const rows = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([k, g]) => {
                const ttl = g.s20F + g.s20E + g.s40F + g.s40E + g.s40HF + g.s40HE + g.s45F + g.s45E;
                const ttlE = g.s20E + g.s40E + g.s40HE + g.s45E;
                const teu = (g.s20F + g.s20E) + (g.s40F + g.s40E + g.s40HF + g.s40HE + g.s45F + g.s45E) * 2;
                const teuE = g.s20E + (g.s40E + g.s40HE + g.s45E) * 2;
                const fmtC = (f, e) => e > 0 ? `${f + e}(${e})` : `${f + e}`;
                return [
                    k, fmtC(g.s20F, g.s20E), fmtC(g.s40F, g.s40E), fmtC(g.s40HF, g.s40HE),
                    fmtC(g.s45F, g.s45E), g.rf || '', g.dg || '',
                    fmtC(ttl - ttlE, ttlE), fmtC(teu - teuE, teuE), g.wgt.toFixed(1)
                ];
            });
            // Total row
            let t20F = 0, t20E = 0, t40F = 0, t40E = 0, t40HF = 0, t40HE = 0, t45F = 0, t45E = 0, tRF = 0, tDG = 0, tW = 0;
            dataList.forEach(c => {
                const isFull = c.fullEmpty !== 'E';
                if (c.size === 20) { isFull ? t20F++ : t20E++; }
                else if (c.size === 45) { isFull ? t45F++ : t45E++; }
                else if (is40HC(c)) { isFull ? t40HF++ : t40HE++; }
                else { isFull ? t40F++ : t40E++; }
                if (c.temp !== undefined && c.temp !== null && c.temp !== '') tRF++;
                if (c.dg) tDG++;
                if (c.weight) tW += parseFloat(c.weight);
            });
            const tT = t20F + t20E + t40F + t40E + t40HF + t40HE + t45F + t45E;
            const tTE = t20E + t40E + t40HE + t45E;
            const tTeu = (t20F + t20E) + (t40F + t40E + t40HF + t40HE + t45F + t45E) * 2;
            const tTeuE = t20E + (t40E + t40HE + t45E) * 2;
            const fmtC = (f, e) => e > 0 ? `${f + e}(${e})` : `${f + e}`;
            rows.push([
                'TOTAL', fmtC(t20F, t20E), fmtC(t40F, t40E), fmtC(t40HF, t40HE),
                fmtC(t45F, t45E), tRF, tDG,
                fmtC(tT - tTE, tTE), fmtC(tTeu - tTeuE, tTeuE), tW.toFixed(1)
            ]);
            return rows;
        };

        const recapHeaders = ['GROUP', "20'(E)", "40'(E)", "40H'(E)", "45'(E)", 'RF', 'DG', 'TTL (E)', 'TEU (E)', 'WEIGHT(T)'];

        // 1. BY POL (Target Port Filtered)
        const polRecap = getRecapData(selectedOprOnly, c => c.pol || c.port || '-');

        // 2. BY POD (Target Port Filtered)
        const podRecap = getRecapData(selectedOprOnly, c => c.podr || c.pod || c.port || '-');

        // 3. BY OPERATOR (Target Port Filtered)
        const oprRecap = getRecapData(targetFiltered, c => c.opr || '-');

        // 4. INCLUDE ALL POD (ignores target port)
        const allPortList = mode === 'dis'
            ? this.disContainers.filter(c => !c.isRestow)
            : this.lodContainers.filter(c => !c.isRestow);
        const filteredAllPortList = this.selectedOperator === 'ALL'
            ? allPortList
            : allPortList.filter(c => c.opr === this.selectedOperator);
        const allPodRecap = getRecapData(filteredAllPortList, c => c.podr || c.pod || c.port || '-');

        if (typeof XLSX === 'undefined') { alert('SheetJS not loaded.'); return; }
        const wb = XLSX.utils.book_new();

        // Sheet 1: Main List
        const wsMain = XLSX.utils.aoa_to_sheet([[`${label} LIST - PORT: ${this.targetPort} / OPR: ${this.selectedOperator}`], listHeaders, ...listRows]);
        XLSX.utils.book_append_sheet(wb, wsMain, label + ' List');

        // Sheet 2: RECAP
        const recapData = [
            [`RECAP STATISTICS - ${label}`], [],
            [`1. BY POL (Target Port: ${this.targetPort})`], recapHeaders, ...polRecap, [],
            [`2. BY POD (Target Port: ${this.targetPort})`], recapHeaders, ...podRecap, [],
            [`3. BY OPERATOR (Target Port: ${this.targetPort})`], recapHeaders, ...oprRecap, [],
            [`4. INCLUDE ALL POD (Total Volume)`], recapHeaders, ...allPodRecap
        ];
        const wsRecap = XLSX.utils.aoa_to_sheet(recapData);
        XLSX.utils.book_append_sheet(wb, wsRecap, 'RECAP');

        XLSX.writeFile(wb, `${this.vessel}_${label}_${this.targetPort}.xlsx`);
    }

    // ─────────────────────────────────────────────────────
    // HISTORY  (localStorage key: 'bayplanHistory')
    // ─────────────────────────────────────────────────────

    populateHistoryForm() {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`; // Default to YYYY-MM-DD
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

    async getHistory() {
        try {
            const snapshot = await window.db.collection('bayplanHistory').get();
            let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Migration for legacy records missing F/E stats
            let migrationPromises = [];
            for (let doc of docs) {
                if (doc.disF20 === undefined && (doc.payloadPath || doc.payloadUrl)) {
                    migrationPromises.push((async () => {
                        try {
                            const payload = await this._loadPayloadFromStorage(doc.payloadPath || `bayplanPayload/${doc.id}.json`);

                            let disF = 0, disE = 0, lodF = 0, lodE = 0;
                            let disF20 = 0, disF40 = 0, disE20 = 0, disE40 = 0;
                            let lodF20 = 0, lodF40 = 0, lodE20 = 0, lodE40 = 0;
                            let disTeu = 0, lodTeu = 0;
                            const targetPort = doc.port;

                            (payload.disData || []).forEach(c => {
                                if ((c.pod || c.port) === targetPort && !c.isRestow) {
                                    const is20 = parseInt(c.size) === 20;
                                    const teu = is20 ? 1 : 2;
                                    if (c.fullEmpty === 'E') {
                                        disE++;
                                        if (is20) disE20++; else disE40++;
                                    } else {
                                        disF++;
                                        if (is20) disF20++; else disF40++;
                                    }
                                    disTeu += teu;
                                }
                            });
                            (payload.lodData || []).forEach(c => {
                                if ((c.pol || c.port) === targetPort && !c.isRestow) {
                                    const is20 = parseInt(c.size) === 20;
                                    const teu = is20 ? 1 : 2;
                                    if (c.fullEmpty === 'E') {
                                        lodE++;
                                        if (is20) lodE20++; else lodE40++;
                                    } else {
                                        lodF++;
                                        if (is20) lodF20++; else lodF40++;
                                    }
                                    lodTeu += teu;
                                }
                            });

                            const updates = {
                                disF, disE, lodF, lodE, disTeu, lodTeu,
                                disF20, disF40, disE20, disE40,
                                lodF20, lodF40, lodE20, lodE40
                            };
                            await window.db.collection('bayplanHistory').doc(doc.id).update(updates);
                            Object.assign(doc, updates);
                        } catch (e) {
                            console.warn("Migration failed for", doc.id, e);
                        }
                    })());
                }
            }
            if (migrationPromises.length > 0) {
                await Promise.all(migrationPromises);
            }

            // Sort by Date ascending (chronological ETA)
            docs.sort((a, b) => {
                const da = a.date || '';
                const db = b.date || '';
                if (da < db) return -1;
                if (da > db) return 1;
                return 0;
            });
            return docs;
        } catch (e) {
            console.error('Error getting history:', e);
            return [];
        }
    }

    // Save EDI payload to Firebase Storage as JSON (no size limit)
    async _savePayloadToStorage(docId, disData, lodData) {
        const json = JSON.stringify({ disData, lodData });
        const blob = new Blob([json], { type: 'application/json' });
        const size = blob.size;
        const path = `bayplanPayload/${docId}.json`;
        const ref = window.storage.ref(path);
        await ref.put(blob);
        const url = await ref.getDownloadURL();
        return { url, size, path };
    }

    // Load EDI payload from Firebase Storage (CORS-safe via fresh URL)
    async _loadPayloadFromStorage(path) {
        // Get fresh download URL via Storage SDK (includes valid auth token)
        const ref = window.storage.ref(path);
        const url = await ref.getDownloadURL();
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.responseType = 'json';
            xhr.onload = () => resolve({
                disData: xhr.response?.disData || [],
                lodData: xhr.response?.lodData || []
            });
            xhr.onerror = () => reject(new Error('XHR fetch failed'));
            xhr.open('GET', url);
            xhr.send();
        });
    }

    async saveHistory() {
        const vesselVal = document.getElementById('histVessel').value;
        if (!vesselVal) { alert('Please load EDI data first.'); return; }

        let meta = {
            date: document.getElementById('histDate').value,
            vessel: vesselVal,
            port: document.getElementById('histPort').value,
            dis: parseInt(document.getElementById('histDis').value) || 0,
            lod: parseInt(document.getElementById('histLod').value) || 0,
            twin: parseInt(document.getElementById('histTwin').value) || 0,
            restow: parseInt(document.getElementById('histRestow').value) || 0,
            berth: document.getElementById('histBerth').value,
            gang: document.getElementById('histGang').value,
            prod: document.getElementById('histProd').value,
            memo: document.getElementById('histMemo').value
        };

        try {
            const histPortVal = document.getElementById('histPort').value;
            // 항상 F/E 및 20/40 TEU 갯수를 다시 계산합니다 (기존 기록 편집 시에도 반영)
            let disF = 0, disE = 0, lodF = 0, lodE = 0;
            let disF20 = 0, disF40 = 0, disE20 = 0, disE40 = 0;
            let lodF20 = 0, lodF40 = 0, lodE20 = 0, lodE40 = 0;
            let disTeu = 0, lodTeu = 0;

            this.disContainers.forEach(c => {
                if ((c.pod || c.port) === histPortVal && !c.isRestow) {
                    const is20 = c.size === 20;
                    const teu = is20 ? 1 : 2;
                    if (c.fullEmpty === 'E') {
                        disE++; disTeu += teu;
                        if (is20) disE20++; else disE40++;
                    } else {
                        disF++; disTeu += teu;
                        if (is20) disF20++; else disF40++;
                    }
                }
            });
            this.lodContainers.forEach(c => {
                if ((c.pol || c.port) === histPortVal && !c.isRestow) {
                    const is20 = c.size === 20;
                    const teu = is20 ? 1 : 2;
                    if (c.fullEmpty === 'E') {
                        lodE++; lodTeu += teu;
                        if (is20) lodE20++; else lodE40++;
                    } else {
                        lodF++; lodTeu += teu;
                        if (is20) lodF20++; else lodF40++;
                    }
                }
            });

            // 계산된 값을 meta 데이터에 추가합니다.
            meta.disF = disF; meta.disE = disE; meta.lodF = lodF; meta.lodE = lodE;
            meta.disF20 = disF20; meta.disF40 = disF40; meta.disE20 = disE20; meta.disE40 = disE40;
            meta.lodF20 = lodF20; meta.lodF40 = lodF40; meta.lodE20 = lodE20; meta.lodE40 = lodE40;
            meta.disTeu = disTeu; meta.lodTeu = lodTeu;

            if (this.editingHistId) {
                // Edit existing metadata only, preserve payload & IDs
                meta.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                await window.db.collection('bayplanHistory').doc(this.editingHistId).update(meta);
                this.editingHistId = null;
                alert('Record updated in Firebase!');
            } else {
                // New record: calculate extra fields required for new creation
                meta.vesselName = this.vessel;
                meta.voyageName = this.voyage;
                meta.allIds = [...this.disContainers.map(c => c.id.toUpperCase()), ...this.lodContainers.map(c => c.id.toUpperCase())];
                meta.timestamp = firebase.firestore.FieldValue.serverTimestamp();

                const metaSize = new Blob([JSON.stringify(meta)]).size;
                meta.metaSize = metaSize;

                const ref = await window.db.collection('bayplanHistory').add(meta);
                const docId = ref.id;

                // Upload EDI payload
                const { url: payloadUrl, size: payloadSize, path: payloadPath } = await this._savePayloadToStorage(docId, this.disContainers, this.lodContainers);
                await window.db.collection('bayplanHistory').doc(docId).update({ payloadUrl, payloadSize, payloadPath });
                alert('Record saved to Firebase!');
            }

            document.getElementById('histMemo').value = '';
            this.renderHistoryTable();
        } catch (e) {
            console.error('Error saving record:', e);
            alert('Failed to save to Firebase:\n' + e.message);
        }
    }

    async editHistoryRecord(id) {
        try {
            const docSnap = await window.db.collection('bayplanHistory').doc(id).get();
            if (!docSnap.exists) return;

            const r = docSnap.data();
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
        } catch (e) {
            console.error("Error fetching record for edit: ", e);
        }
    }

    async loadHistoryData(id) {
        try {
            const metaSnap = await window.db.collection('bayplanHistory').doc(id).get();
            if (!metaSnap.exists) return;
            const r = metaSnap.data();

            if (!r.payloadPath && !r.payloadUrl) {
                alert('이 레코드에는 EDI 데이터가 없습니다.\nEDI 파일을 다시 드롭하여 로드해주세요.');
                return;
            }
            if (!confirm('Load this session? Current unsaved work will be lost.')) return;

            // Use path for fresh SDK URL, fall back to stored URL
            const { disData, lodData } = await this._loadPayloadFromStorage(
                r.payloadPath || `bayplanPayload/${id}.json`
            );

            this.disContainers = disData;
            this.lodContainers = lodData;
            this.vessel = r.vesselName || '';
            this.voyage = r.voyageName || '';
            this.targetPort = r.port || '';

            const targetSel = document.getElementById('targetPort');
            if (targetSel && this.targetPort) targetSel.value = this.targetPort;

            const vesselInfo = document.getElementById('vesselInfo');
            if (vesselInfo) {
                vesselInfo.textContent = (this.vessel && this.voyage)
                    ? `${this.vessel} / ${this.voyage}` : 'NO DATA LOADED';
            }

            this.updateUI();

            const stowageTab = document.querySelector('.tab[data-tab="stowage"]');
            if (stowageTab) stowageTab.click();

            alert('Session loaded successfully!');
        } catch (e) {
            console.error('Error loading history data:', e);
            alert('Failed to load from Firebase:\n' + e.message);
        }
    }

    async deleteHistoryRecord(id) {
        if (!confirm('Delete this record?')) return;
        try {
            // Delete Firestore metadata
            await window.db.collection('bayplanHistory').doc(id).delete();
            // Delete Storage file
            try {
                await window.storage.ref(`bayplanPayload/${id}.json`).delete();
            } catch (se) {
                console.warn('Storage file not found or already deleted:', se.message);
            }
            this.renderHistoryTable();
        } catch (e) {
            console.error('Error deleting record:', e);
        }
    }

    _fmtBytes(bytes) {
        if (!bytes) return '-';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    async renderHistoryTable() {
        const tbody = document.getElementById('historyTableBody');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="13" style="text-align:center;padding:20px;color:var(--text-secondary);">Loading from Firebase...</td></tr>';

        const history = await this.getHistory();

        // ── Storage Stats Panel ──────────────────────────────
        const statsEl = document.getElementById('historyStorageStats');
        if (statsEl) {
            const FREE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB
            const totalBytes = history.reduce((s, r) => s + (r.metaSize || 0) + (r.payloadSize || 0), 0);
            const pct = ((totalBytes / FREE_BYTES) * 100).toFixed(3);
            const vesselCount = history.length;
            statsEl.innerHTML = `
                <span>☁️ <b style="color:#38bdf8;">Firebase Storage</b></span>
                <span style="color:var(--text-secondary);">무료 한도:</span>
                <span style="color:#22c55e;font-weight:700;">5 GB</span>
                <span style="color:rgba(255,255,255,0.2);">|</span>
                <span style="color:var(--text-secondary);">사용 중:</span>
                <span style="color:#f59e0b;font-weight:700;">${this._fmtBytes(totalBytes)}</span>
                <span style="color:rgba(255,255,255,0.2);">|</span>
                <span style="color:var(--text-secondary);">사용률:</span>
                <span style="color:${parseFloat(pct) > 80 ? '#ef4444' : '#a78bfa'};font-weight:700;">${pct}%</span>
                <span style="color:rgba(255,255,255,0.2);">|</span>
                <span style="color:var(--text-secondary);">저장 선박:</span>
                <span style="color:#38bdf8;font-weight:700;">${vesselCount}척</span>`;
        }

        if (history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="13" style="text-align:center;padding:20px;color:var(--text-secondary);">No records saved yet in Firebase.</td></tr>';
            // Clear summary charts if no history
            if (document.getElementById('dailyVolumeBody')) document.getElementById('dailyVolumeBody').innerHTML = '';
            if (window.dailyChart) { window.dailyChart.destroy(); window.dailyChart = null; }
            return;
        }

        // --- Render Daily Volume Summary Panel ---
        const dateGroups = {};
        history.forEach(r => {
            const rawDt = r.date ? r.date.split(' ')[0] : 'Unknown';
            const dt = rawDt.length === 8 && !rawDt.includes('-')
                ? rawDt.substring(0, 4) + '-' + rawDt.substring(4, 6) + '-' + rawDt.substring(6, 8)
                : rawDt;

            if (!dateGroups[dt]) {
                dateGroups[dt] = {
                    disF: 0, disE: 0, disTeu: 0, lodF: 0, lodE: 0, lodTeu: 0,
                    disF20: 0, disF40: 0, disE20: 0, disE40: 0,
                    lodF20: 0, lodF40: 0, lodE20: 0, lodE40: 0,
                    isLegacy: true
                };
            }
            if (r.disTeu || r.lodTeu || r.disF || r.lodF || r.disE || r.lodE) {
                dateGroups[dt].isLegacy = false;
            }

            let dTeu = r.disTeu || 0;
            let lTeu = r.lodTeu || 0;
            if (!r.disTeu && !r.lodTeu && (r.dis || r.lod)) {
                dTeu = Math.round(parseInt(r.dis || 0) * 1.5);
                lTeu = Math.round(parseInt(r.lod || 0) * 1.5);
            }

            dateGroups[dt].disF += (r.disF || 0);
            dateGroups[dt].disE += (r.disE || 0);
            dateGroups[dt].disTeu += dTeu;
            dateGroups[dt].lodF += (r.lodF || 0);
            dateGroups[dt].lodE += (r.lodE || 0);
            dateGroups[dt].lodTeu += lTeu;

            dateGroups[dt].disF20 += (r.disF20 || 0);
            dateGroups[dt].disF40 += (r.disF40 || 0);
            dateGroups[dt].disE20 += (r.disE20 || 0);
            dateGroups[dt].disE40 += (r.disE40 || 0);
            dateGroups[dt].lodF20 += (r.lodF20 || 0);
            dateGroups[dt].lodF40 += (r.lodF40 || 0);
            dateGroups[dt].lodE20 += (r.lodE20 || 0);
            dateGroups[dt].lodE40 += (r.lodE40 || 0);
        });

        const sortedDates = Object.keys(dateGroups).sort();
        const summaryBody = document.getElementById('dailyVolumeBody');
        if (summaryBody) {
            summaryBody.innerHTML = '';
            let sum_dF = 0, sum_dE = 0, sum_dT = 0;
            let sum_lF = 0, sum_lE = 0, sum_lT = 0;
            let sum_dF20 = 0, sum_dF40 = 0, sum_dE20 = 0, sum_dE40 = 0;
            let sum_lF20 = 0, sum_lF40 = 0, sum_lE20 = 0, sum_lE40 = 0;

            sortedDates.forEach(dt => {
                const g = dateGroups[dt];

                sum_dF += g.disF; sum_dE += g.disE; sum_dT += g.disTeu;
                sum_lF += g.lodF; sum_lE += g.lodE; sum_lT += g.lodTeu;
                sum_dF20 += g.disF20; sum_dF40 += g.disF40; sum_dE20 += g.disE20; sum_dE40 += g.disE40;
                sum_lF20 += g.lodF20; sum_lF40 += g.lodF40; sum_lE20 += g.lodE20; sum_lE40 += g.lodE40;

                const formatCell = (val, val20, val40) => {
                    return `${val} <span style="font-size:10px; color:var(--text-secondary); margin-left:4px;">(${val20} / ${val40})</span>`;
                };

                const dFTxt = formatCell(g.disF, g.disF20, g.disF40);
                const dETxt = formatCell(g.disE, g.disE20, g.disE40);
                const lFTxt = formatCell(g.lodF, g.lodF20, g.lodF40);
                const lETxt = formatCell(g.lodE, g.lodE20, g.lodE40);

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="text-align:center;font-weight:bold;">${dt}</td>
                    <td style="text-align:center;color:${g.isLegacy ? 'var(--text-secondary)' : 'inherit'};">${dFTxt}</td>
                    <td style="text-align:center;color:${g.isLegacy ? 'var(--text-secondary)' : 'inherit'};">${dETxt}</td>
                    <td style="text-align:center;font-weight:bold;color:#f59e0b;">${g.disTeu}</td>
                    <td style="text-align:center;color:${g.isLegacy ? 'var(--text-secondary)' : 'inherit'};">${lFTxt}</td>
                    <td style="text-align:center;color:${g.isLegacy ? 'var(--text-secondary)' : 'inherit'};">${lETxt}</td>
                    <td style="text-align:center;font-weight:bold;color:#22c55e;">${g.lodTeu}</td>
                `;
                summaryBody.appendChild(tr);
            });

            // Add Total Row
            const formatTotalCell = (val, val20, val40) => {
                return `${val} <span style="font-size:10px; color:rgba(255,255,255,0.5); margin-left:4px;">(${val20} / ${val40})</span>`;
            };

            const trTotal = document.createElement('tr');
            trTotal.style.backgroundColor = 'rgba(255,255,255,0.06)';
            trTotal.style.borderTop = '2px solid rgba(255,255,255,0.2)';
            trTotal.innerHTML = `
                <td style="text-align:center;font-weight:bold;color:#38bdf8;">TOTAL</td>
                <td style="text-align:center;font-weight:bold;">${formatTotalCell(sum_dF, sum_dF20, sum_dF40)}</td>
                <td style="text-align:center;font-weight:bold;">${formatTotalCell(sum_dE, sum_dE20, sum_dE40)}</td>
                <td style="text-align:center;font-weight:bold;color:#f59e0b;">${sum_dT}</td>
                <td style="text-align:center;font-weight:bold;">${formatTotalCell(sum_lF, sum_lF20, sum_lF40)}</td>
                <td style="text-align:center;font-weight:bold;">${formatTotalCell(sum_lE, sum_lE20, sum_lE40)}</td>
                <td style="text-align:center;font-weight:bold;color:#22c55e;">${sum_lT}</td>
            `;
            summaryBody.appendChild(trTotal);
        }

        this.renderDailyChart(sortedDates, dateGroups);

        tbody.innerHTML = '';
        history.forEach((r, i) => {
            const tr = document.createElement('tr');
            if (i % 2 === 1) tr.style.background = 'rgba(255,255,255,0.02)';

            let createdDate = '-';
            if (r.timestamp && r.timestamp.seconds) {
                const cd = new Date(r.timestamp.seconds * 1000);
                const pad = n => String(n).padStart(2, '0');
                createdDate = `${cd.getFullYear()}-${pad(cd.getMonth() + 1)}-${pad(cd.getDate())} ${pad(cd.getHours())}:${pad(cd.getMinutes())}`;
            } else if (r.date) {
                createdDate = r.date;
            }

            let etaDate = r.date || '-';

            tr.innerHTML = `
                <td style="white-space:nowrap;font-size:11px;color:var(--text-secondary);width:1%;">${createdDate}</td>
                <td style="white-space:nowrap;font-size:11px;color:#38bdf8;font-weight:bold;width:1%;">${etaDate}</td>
                <td style="font-weight:600;white-space:nowrap;width:1%;">${r.vessel || '-'}</td>
                <td style="text-align:center;width:1%;">${r.port || '-'}</td>
                <td style="text-align:center;color:#f59e0b;font-weight:bold;width:1%;">${r.dis || '-'}</td>
                <td style="text-align:center;color:#22c55e;font-weight:bold;width:1%;">${r.lod || '-'}</td>
                <td style="text-align:center;color:#ec4899;width:1%;">${r.twin || '-'}</td>
                <td style="text-align:center;color:#a855f7;width:1%;">${r.restow || '-'}</td>
                <td style="text-align:center;width:1%;">${r.berth || '-'}</td>
                <td style="text-align:center;width:1%;">${r.gang || '-'}</td>
                <td style="text-align:center;width:1%;">${r.prod || '-'}</td>
                <td style="color:var(--text-secondary);font-size:12px;white-space:normal;text-align:left;width:100%;">${r.memo || ''}</td>
                <td style="text-align:center;white-space:nowrap;width:1%;color:#94a3b8;font-size:11px;">${this._fmtBytes((r.metaSize || 0) + (r.payloadSize || 0))}</td>
                <td style="text-align:center;width:1%;">
                    <div style="display:flex;gap:5px;justify-content:center;">
                        ${(r.payloadUrl || r.payloadPath) ? `<button onclick="sim.loadHistoryData('${r.id}')" title="Load Session" style="background:#3b82f6;border:none;color:white;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px;">Load</button>` : ''}
                        <button onclick="sim.editHistoryRecord('${r.id}')" title="Edit Memo/Values" style="background:#eab308;border:none;color:white;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px;">Edit</button>
                        <button onclick="sim.deleteHistoryRecord('${r.id}')" title="Delete Record" style="background:transparent;border:1px solid #ef4444;color:#ef4444;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px;">✕</button>
                    </div>
                </td>`;
            tbody.appendChild(tr);
        });
    }

    async exportHistoryCSV() {
        const history = await this.getHistory();
        if (history.length === 0) { alert('No history records to export.'); return; }
        const headers = ['Date(Created)', 'ETA(ATB)', 'Vessel/Voy', 'Port', 'D', 'L', 'Twin', 'Restow', 'Berth(h)', 'Gang', 'Productivity', 'Memo', 'Total Size'];
        const rows = history.map(r => {
            let createdDate = '-';
            if (r.timestamp && r.timestamp.seconds) {
                const cd = new Date(r.timestamp.seconds * 1000);
                const pad = n => String(n).padStart(2, '0');
                createdDate = `${cd.getFullYear()}-${pad(cd.getMonth() + 1)}-${pad(cd.getDate())} ${pad(cd.getHours())}:${pad(cd.getMinutes())}`;
            } else if (r.date) { createdDate = r.date; }

            return [
                createdDate,
                r.date || '',
                r.vessel,
                r.port,
                r.dis,
                r.lod,
                r.twin,
                r.restow,
                r.berth,
                r.gang,
                r.prod,
                r.memo,
                this._fmtBytes((r.metaSize || 0) + (r.payloadSize || 0))
            ];
        });
        const csv = [headers, ...rows].map(row => row.map(c => '"' + String(c || '').replace(/"/g, '""') + '"').join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'BayplanHistory_' + new Date().toISOString().slice(0, 10) + '.csv';
        a.click();
        URL.revokeObjectURL(url);
    }

    async clearHistory() {
        if (!confirm('Delete ALL history records from Firebase? This cannot be undone.')) return;
        try {
            const history = await this.getHistory();
            for (const r of history) {
                await window.db.collection('bayplanHistory').doc(r.id).delete();
                // Delete Storage file
                try {
                    await window.storage.ref(`bayplanPayload/${r.id}.json`).delete();
                } catch (se) {
                    console.warn('Storage file not found:', se.message);
                }
            }
            this.renderHistoryTable();
            alert('All records cleared from Firebase.');
        } catch (e) {
            console.error('Error clearing history:', e);
        }
    }

    // ─────────────────────────────────────────────────────
    // FIND
    // ─────────────────────────────────────────────────────
    async searchContainers() {
        const raw = document.getElementById('findInput')?.value || '';
        if (!raw.trim()) { alert('컨테이너 ID를 입력하세요.'); return; }

        const ids = raw.split(/[\n\r]+/)
            .map(line => line.split(/[\t,]/)[0].trim().toUpperCase())
            .filter(Boolean);

        this.searchedIds = new Set(ids);

        const disMap = new Map(this.disContainers.map(c => [c.id.toUpperCase(), c]));
        const lodMap = new Map(this.lodContainers.map(c => [c.id.toUpperCase(), c]));

        const body = document.getElementById('findResultBody');
        const countEl = document.getElementById('findResultCount');
        if (!body) return;
        body.innerHTML = '';

        // Header for Current Load
        body.innerHTML += `<tr style="background:rgba(255,255,255,0.05);"><td colspan="14" style="color:var(--accent-color);font-weight:800;padding:8px 12px;">🚢 CURRENTLY LOADED: ${this.vessel || '---'}</td></tr>`;

        let foundInCurrent = 0;
        const currentFoundIds = new Set();

        ids.forEach((id, i) => {
            const disC = disMap.get(id);
            const lodC = lodMap.get(id);
            const c = disC || lodC;

            if (c) {
                foundInCurrent++;
                currentFoundIds.add(id);
                this._renderFindRow(body, i + 1, c, disC, lodC, `${this.vessel} / ${this.voyage}`, '-', '-');
            }
        });

        if (foundInCurrent === 0) {
            body.innerHTML += `<tr><td colspan="14" style="text-align:center;padding:15px;color:var(--text-secondary);font-size:12px;">No matching containers found in current load.</td></tr>`;
        }

        // Header for History
        body.innerHTML += `<tr style="background:rgba(56,189,248,0.1);"><td colspan="14" style="color:#38bdf8;font-weight:800;padding:8px 12px;">📂 SEARCHING HISTORY RECORDS...</td></tr>`;

        if (countEl) countEl.textContent = `Searching... (Current: ${foundInCurrent})`;

        try {
            const historyMatches = await this.searchHistoryContainers(ids);

            // Only show those NOT in current load
            const historyOnly = historyMatches.filter(h => !currentFoundIds.has(h.id.toUpperCase()));

            if (historyOnly.length === 0) {
                body.innerHTML += `<tr><td colspan="14" style="text-align:center;padding:15px;color:var(--text-secondary);font-size:12px;">No additional matches found in history.</td></tr>`;
            } else {
                historyOnly.forEach((h, i) => {
                    this._renderFindRow(body, foundInCurrent + i + 1, h, h.status === 'DIS', h.status === 'LOD', h.histVessel, h.histDate, h.histMemo, true);
                });
            }
            if (countEl) countEl.textContent = `${ids.length} IDs searched — Current Load: ${foundInCurrent}, History: ${historyOnly.length}`;

            // Final NOT FOUND section
            const allFoundIds = new Set([...currentFoundIds, ...historyMatches.map(h => h.id.toUpperCase())]);
            const notFoundIds = ids.filter(id => !allFoundIds.has(id));
            if (notFoundIds.length > 0) {
                body.innerHTML += `<tr style="background:rgba(239,68,68,0.05);"><td colspan="14" style="color:#ef4444;font-weight:800;padding:8px 12px;">❌ NOT FOUND (${notFoundIds.length})</td></tr>`;
                notFoundIds.forEach((id, i) => {
                    body.innerHTML += `
                        <tr style="background:rgba(239,68,68,0.02);">
                            <td style="text-align:center;color:var(--text-secondary);">${i + 1}</td>
                            <td style="font-family:monospace;font-weight:600;color:#ef4444;">${id}</td>
                            <td colspan="12" style="color:#ef4444;font-size:12px;">NOT FOUND IN ANY RECORDS</td>
                        </tr>`;
                });
            }

        } catch (err) {
            console.error("History search error:", err);
            body.innerHTML += `<tr><td colspan="14" style="color:#ef4444;text-align:center;padding:10px;">History Search Failed: ${err.message}</td></tr>`;
        }
    }

    _renderFindRow(container, idx, c, isDis, isLod, vesselStr, dateStr, memoStr, isHistory = false) {
        let statusLabel, statusColor;
        if (isDis && isLod) { statusLabel = 'DIS+LOD'; statusColor = '#ec4899'; }
        else if (isDis) { statusLabel = 'DIS'; statusColor = '#f59e0b'; }
        else { statusLabel = 'LOD'; statusColor = '#22c55e'; }

        const tr = document.createElement('tr');
        if (isHistory) tr.style.opacity = '0.9';

        const mappedType = this.getMappedType(c.type);
        const fe = c.fullEmpty === 'F' ? 'FULL' : c.fullEmpty === 'E' ? 'EMPTY' : '-';
        const feColor = c.fullEmpty === 'F' ? '#22c55e' : '#94a3b8';
        const bayCode = c.pos ? c.pos.substring(0, 2) : null;

        tr.innerHTML = `
            <td style="text-align:center;color:var(--text-secondary);">${idx}</td>
            <td style="font-family:monospace;font-weight:700;">${c.id}</td>
            <td style="text-align:center;font-weight:700;color:${statusColor};font-size:11px;">${statusLabel}</td>
            <td style="font-size:11px;white-space:nowrap;">${vesselStr}</td>
            <td style="font-size:11px;color:var(--text-secondary);white-space:nowrap;">${dateStr}</td>
            <td style="text-align:center;">${bayCode && !isHistory
                ? `<span style="font-family:monospace;font-weight:700;color:#38bdf8;cursor:pointer;padding:3px 8px;border:1px solid rgba(56,189,248,0.4);border-radius:4px;display:inline-block;"
                    onclick="window.sim.openBayWithHighlight('${c.id}')">${c.pos}</span>`
                : `<span style="font-family:monospace;color:var(--text-secondary);">${c.pos || '-'}</span>`}</td>
            <td style="font-size:11px;max-width:150px;overflow:hidden;text-overflow:ellipsis;" title="${memoStr}">${memoStr}</td>
            <td style="text-align:center;">${c.size}'</td>
            <td style="text-align:center;">${mappedType || '-'}</td>
            <td>${c.pol || c.port || '-'}</td>
            <td>${c.pod || '-'}</td>
            <td style="color:${feColor};font-weight:600;">${fe}</td>
            <td style="text-align:right;">${c.weight ? c.weight + ' T' : '-'}</td>
            <td style="text-align:center;color:var(--accent-color);font-weight:600;">${c.opr || '-'}</td>`;
        container.appendChild(tr);
    }

    async searchHistoryContainers(ids) {
        const results = [];
        const historySnap = await window.db.collection('bayplanHistory').get();
        if (historySnap.empty) return [];

        const searchIds = ids.map(id => id.toUpperCase());
        const payloadCache = new Map();

        for (const doc of historySnap.docs) {
            const data = doc.data();
            if (!data.allIds) continue;

            const matches = searchIds.filter(id => data.allIds.includes(id));
            if (matches.length > 0) {
                // To get container details, we must load the payload
                let payload;
                const docId = doc.id;
                if (payloadCache.has(docId)) {
                    payload = payloadCache.get(docId);
                } else {
                    try {
                        payload = await this._loadPayloadFromStorage(data.payloadPath || `bayplanPayload/${docId}.json`);
                        payloadCache.set(docId, payload);
                    } catch (e) {
                        console.warn("Could not load payload for history search", docId, e);
                        continue;
                    }
                }

                const allInHist = [...payload.disData.map(x => ({ ...x, status: 'DIS' })), ...payload.lodData.map(x => ({ ...x, status: 'LOD' }))];
                matches.forEach(mId => {
                    const matchC = allInHist.find(x => x.id.toUpperCase() === mId);
                    if (matchC) {
                        results.push({
                            ...matchC,
                            histVessel: data.vessel,
                            histDate: data.date,
                            histMemo: data.memo
                        });
                    }
                });
            }
        }
        return results;
    }

    openBayWithHighlight(containerId) {
        const upper = containerId.toUpperCase();
        const c = this.disContainers.find(c => c.id.toUpperCase() === upper)
            || this.lodContainers.find(c => c.id.toUpperCase() === upper);
        if (!c || !c.pos) return;

        const bayCode = c.pos.substring(0, 2);

        // Switch to General Stowage tab
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        const stowTab = document.querySelector('[data-tab="stowage"]');
        if (stowTab) stowTab.classList.add('active');
        document.querySelectorAll('.view-container').forEach(v => v.classList.add('hidden'));
        const stowView = document.getElementById('stowageView');
        if (stowView) stowView.classList.remove('hidden');

        // Determine target bay group
        let targetGroup = null;
        if (this.bayGroupsForNavigation) {
            targetGroup = this.bayGroupsForNavigation.find(g => g.includes(bayCode));
        }
        const openCodes = targetGroup || [bayCode];

        // Find all searched containers in this bay group
        this.highlightContainerIds = new Set();
        const allVisible = this.getAllVisibleContainers();
        allVisible.forEach(vc => {
            if (this.searchedIds && this.searchedIds.has(vc.id.toUpperCase())) {
                const vBay = vc.pos.substring(0, 2);
                if (openCodes.includes(vBay)) {
                    this.highlightContainerIds.add(vc.id);
                }
            }
        });

        // Fallback if none found via searchedIds (manual click?)
        if (this.highlightContainerIds.size === 0) {
            this.highlightContainerIds.add(c.id);
        }

        // Reset focus when opening from find list
        this.selectedContainerId = null;

        // Open the bay detail modal
        this.openDetailedBayGroup(openCodes);

        // Update info panel with all found containers in this bay
        setTimeout(() => {
            const infoPanel = document.getElementById('ctrInfoPanel');
            if (infoPanel) {
                this.showMultiContainerInfo(Array.from(this.highlightContainerIds), infoPanel);
            }
        }, 150);
    }

    // ─────────────────────────────────────────────────────
    // COMPARE
    // ─────────────────────────────────────────────────────
    _parseTSV(text) {
        return text.trim().split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => {
                const cols = line.split('\t');
                return {
                    id: (cols[0] || '').trim(),
                    a: (cols[1] || '').trim(),
                    b: (cols[2] || '').trim(),
                    c: (cols[3] || '').trim(),
                    d: (cols[4] || '').trim(),
                    e: (cols[5] || '').trim()
                };
            });
    }

    compareLists() {
        const masterRaw = document.getElementById('masterListInput')?.value || '';
        const targetRaw = document.getElementById('targetListInput')?.value || '';
        if (!masterRaw.trim() || !targetRaw.trim()) { alert('Please paste both Master and Target lists.'); return; }

        const masterList = this._parseTSV(masterRaw);
        const targetList = this._parseTSV(targetRaw);

        const targetMap = new Map(targetList.map(r => [r.id, r]));
        const masterMap = new Map(masterList.map(r => [r.id, r]));

        const masterData = masterList.map(r => {
            const match = targetMap.has(r.id);
            return { ...r, match };
        });

        const targetData = targetList.map(r => {
            const match = masterMap.has(r.id);
            if (match) {
                const master = masterMap.get(r.id);
                return { id: r.id, a: master.a, b: master.b, c: master.c, d: master.d, e: master.e, match: true };
            }
            return { ...r, match: false };
        });

        this.compMasterData = masterData;
        this.compTargetData = targetData;
        this.compMasterSort = { col: 'match', asc: false };
        this.compTargetSort = { col: 'match', asc: false };

        const matchCount = masterData.filter(r => r.match).length;
        const mismatchCount = masterData.filter(r => !r.match).length + targetData.filter(r => !r.match).length;

        document.getElementById('compMasterCount').textContent = masterData.length;
        document.getElementById('compTargetCount').textContent = targetData.length;
        document.getElementById('compMatchCount').textContent = matchCount;
        document.getElementById('compMismatchCount').textContent = mismatchCount;

        this._renderCompTable('master');
        this._renderCompTable('target');
    }

    clearCompare() {
        const masterIn = document.getElementById('masterListInput');
        const targetIn = document.getElementById('targetListInput');
        if (masterIn) masterIn.value = '';
        if (targetIn) targetIn.value = '';
        this.compMasterData = [];
        this.compTargetData = [];
        document.getElementById('masterCompBody').innerHTML = '';
        document.getElementById('targetCompBody').innerHTML = '';
        document.getElementById('compMasterCount').textContent = '0';
        document.getElementById('compTargetCount').textContent = '0';
        document.getElementById('compMatchCount').textContent = '0';
        document.getElementById('compMismatchCount').textContent = '0';
    }

    exportCompare() {
        if (!this.compMasterData.length && !this.compTargetData.length) { alert('Run COMPARE first.'); return; }
        if (typeof XLSX === 'undefined') { alert('SheetJS not loaded.'); return; }

        // Column layout: MASTER (cols 0-7) | GAP (col 8) | TARGET (cols 9-16)
        const mHdr = ['[MASTER] O/X', '[MASTER] ID', '[MASTER] A', '[MASTER] B', '[MASTER] C', '[MASTER] D', '[MASTER] E'];
        const tHdr = ['[TARGET] O/X', '[TARGET] ID', '[TARGET] A', '[TARGET] B', '[TARGET] C', '[TARGET] D', '[TARGET] E'];
        const empty7 = Array(7).fill('');
        const gap = [''];

        const headerRow = [...mHdr, ...gap, ...tHdr];

        const maxLen = Math.max(this.compMasterData.length, this.compTargetData.length);
        const rows = [];
        for (let i = 0; i < maxLen; i++) {
            const m = this.compMasterData[i];
            const t = this.compTargetData[i];
            const mCells = m
                ? [m.match ? 'O' : 'X', m.id, m.a, m.b, m.c, m.d, m.e]
                : empty7;
            const tCells = t
                ? [t.match ? 'O' : 'X', t.id, t.a, t.b, t.c, t.d, t.e]
                : empty7;
            rows.push([...mCells, ...gap, ...tCells]);
        }

        const ws = XLSX.utils.aoa_to_sheet([headerRow, ...rows]);

        // Column widths
        ws['!cols'] = [
            { wch: 6 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, // MASTER
            { wch: 2 },                                                          // GAP
            { wch: 6 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, // TARGET
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Compare Result');
        XLSX.writeFile(wb, `Compare_Result_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }

    sortCompTable(side, col) {
        const sortObj = side === 'master' ? this.compMasterSort : this.compTargetSort;
        if (sortObj.col === col) sortObj.asc = !sortObj.asc;
        else { sortObj.col = col; sortObj.asc = true; }
        this._renderCompTable(side);
    }

    _renderCompTable(side) {
        const data = side === 'master' ? [...this.compMasterData] : [...this.compTargetData];
        const sortObj = side === 'master' ? this.compMasterSort : this.compTargetSort;
        const bodyId = side === 'master' ? 'masterCompBody' : 'targetCompBody';
        const body = document.getElementById(bodyId);
        if (!body) return;
        data.sort((a, b) => {
            let va, vb;
            if (sortObj.col === 'match') { va = a.match ? 1 : 0; vb = b.match ? 1 : 0; }
            else { va = (a[sortObj.col] || '').toLowerCase(); vb = (b[sortObj.col] || '').toLowerCase(); }
            if (va < vb) return sortObj.asc ? -1 : 1;
            if (va > vb) return sortObj.asc ? 1 : -1;
            return 0;
        });
        body.innerHTML = data.map(r => {
            const bg = r.match ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)';
            const color = r.match ? '#22c55e' : '#ef4444';
            return `<tr style="background:${bg};">
                <td style="text-align:center;font-weight:bold;font-size:13px;color:${color};">${r.match ? 'O' : 'X'}</td>
                <td style="font-family:monospace;font-weight:600;">${r.id}</td>
                <td>${r.a}</td><td>${r.b}</td><td>${r.c}</td><td>${r.d}</td><td>${r.e}</td>
            </tr>`;
        }).join('');
    }

    renderDailyChart(labels, dataMap) {
        if (typeof Chart === 'undefined') return;
        const ctxDaily = document.getElementById('dailyVolumeChart');
        const ctxCumul = document.getElementById('cumulativeVolumeChart');
        if (!ctxDaily || !ctxCumul) return;

        if (window.dailyChart) window.dailyChart.destroy();
        if (window.cumulativeChart) window.cumulativeChart.destroy();

        const disFData = labels.map(l => dataMap[l].disF);
        const disEData = labels.map(l => dataMap[l].disE);
        const lodFData = labels.map(l => dataMap[l].lodF);
        const lodEData = labels.map(l => dataMap[l].lodE);

        let cDis = 0;
        let cLod = 0;
        const cumDisData = [];
        const cumLodData = [];

        labels.forEach(l => {
            cDis += (dataMap[l].disF + dataMap[l].disE);
            cLod += (dataMap[l].lodF + dataMap[l].lodE);
            cumDisData.push(cDis);
            cumLodData.push(cLod);
        });

        // 1. Daily Volume Chart
        window.dailyChart = new Chart(ctxDaily, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Discharge FULL',
                        data: disFData,
                        borderColor: '#f97316',
                        backgroundColor: '#f97316',
                        borderWidth: 2,
                        tension: 0.3,
                        pointRadius: 4
                    },
                    {
                        label: 'Discharge EMPTY',
                        data: disEData,
                        borderColor: '#fcd34d',
                        backgroundColor: '#fcd34d',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        tension: 0.3,
                        pointRadius: 4
                    },
                    {
                        label: 'Load FULL',
                        data: lodFData,
                        borderColor: '#22c55e',
                        backgroundColor: '#22c55e',
                        borderWidth: 2,
                        tension: 0.3,
                        pointRadius: 4
                    },
                    {
                        label: 'Load EMPTY',
                        data: lodEData,
                        borderColor: '#86efac',
                        backgroundColor: '#86efac',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        tension: 0.3,
                        pointRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#e2e8f0', font: { family: "'Inter', sans-serif" } } }
                },
                scales: {
                    x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#94a3b8', stepSize: 50 },
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        title: { display: true, text: 'Daily Count', color: '#94a3b8', font: { size: 10 } }
                    }
                }
            }
        });

        // 2. Cumulative Volume Chart
        window.cumulativeChart = new Chart(ctxCumul, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Cumulative Discharge',
                        data: cumDisData,
                        borderColor: '#fbbf24',
                        backgroundColor: 'rgba(251, 191, 36, 0.2)',
                        borderWidth: 3,
                        tension: 0.4,
                        pointRadius: 0,
                        fill: true
                    },
                    {
                        label: 'Cumulative Load',
                        data: cumLodData,
                        borderColor: '#4ade80',
                        backgroundColor: 'rgba(74, 222, 128, 0.2)',
                        borderWidth: 3,
                        tension: 0.4,
                        pointRadius: 0,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#e2e8f0', font: { family: "'Inter', sans-serif" } } }
                },
                scales: {
                    x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#fbbf24' },
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        title: { display: true, text: 'Cumulative Volume', color: '#fbbf24', font: { size: 10 } }
                    }
                }
            }
        });
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

