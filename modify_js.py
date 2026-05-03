HISTORY_CODE = '''
    // ─────────────────────────────────────────────────────
    // HISTORY  (localStorage key: 'bayplanHistory')
    // ─────────────────────────────────────────────────────

    populateHistoryForm() {
        const now = new Date();
        const pad = n => String(n).padStart(2,'0');
        const dateStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
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

        const berth = document.getElementById('estBerthTime')?.textContent || '';
        document.getElementById('histBerth').value = (berth && berth !== '0h') ? berth : '';

        const gang = document.getElementById('gcCount')?.value || '';
        document.getElementById('histGang').value = gang;

        const prod = document.getElementById('avgProductivity')?.textContent || '';
        document.getElementById('histProd').value = (prod && prod !== '0') ? prod : '';
    }

    getHistory() {
        try { return JSON.parse(localStorage.getItem('bayplanHistory') || '[]'); }
        catch(e) { return []; }
    }

    saveHistory() {
        const record = {
            id: Date.now(),
            date:   document.getElementById('histDate').value,
            vessel: document.getElementById('histVessel').value,
            port:   document.getElementById('histPort').value,
            dis:    document.getElementById('histDis').value,
            lod:    document.getElementById('histLod').value,
            twin:   document.getElementById('histTwin').value,
            restow: document.getElementById('histRestow').value,
            berth:  document.getElementById('histBerth').value,
            gang:   document.getElementById('histGang').value,
            prod:   document.getElementById('histProd').value,
            memo:   document.getElementById('histMemo').value,
        };

        if (!record.vessel) { alert('Please load EDI data before saving.'); return; }

        const history = this.getHistory();
        history.unshift(record);
        localStorage.setItem('bayplanHistory', JSON.stringify(history));
        document.getElementById('histMemo').value = '';
        this.renderHistoryTable();
        alert('Record saved to local history!');
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
                <td style="white-space:nowrap;font-size:11px;color:var(--text-secondary);">${r.date||'-'}</td>
                <td style="font-weight:600;white-space:nowrap;">${r.vessel||'-'}</td>
                <td style="text-align:center;">${r.port||'-'}</td>
                <td style="text-align:center;color:#f59e0b;font-weight:bold;">${r.dis||'-'}</td>
                <td style="text-align:center;color:#22c55e;font-weight:bold;">${r.lod||'-'}</td>
                <td style="text-align:center;color:#ec4899;">${r.twin||'-'}</td>
                <td style="text-align:center;color:#a855f7;">${r.restow||'-'}</td>
                <td style="text-align:center;">${r.berth||'-'}</td>
                <td style="text-align:center;">${r.gang||'-'}</td>
                <td style="text-align:center;">${r.prod||'-'}</td>
                <td style="color:var(--text-secondary);font-size:12px;">${r.memo||''}</td>
                <td style="text-align:center;">
                    <button onclick="sim.deleteHistoryRecord(${r.id})"
                        style="background:transparent;border:1px solid #ef4444;color:#ef4444;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:11px;">x</button>
                </td>`;
            tbody.appendChild(tr);
        });
    }

    exportHistoryCSV() {
        const history = this.getHistory();
        if (history.length === 0) { alert('No history records to export.'); return; }
        const headers = ['Date','Vessel/Voy','Port','D','L','Twin','Restow','Berth(h)','Gang','Productivity','Memo'];
        const rows = history.map(r => [r.date,r.vessel,r.port,r.dis,r.lod,r.twin,r.restow,r.berth,r.gang,r.prod,r.memo]);
        const csv = [headers,...rows].map(row => row.map(c => '"'+String(c||'').replace(/"/g,'""')+'"').join(',')).join('\\n');
        const blob = new Blob(['\\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'BayplanHistory_'+new Date().toISOString().slice(0,10)+'.csv';
        a.click();
        URL.revokeObjectURL(url);
    }

    clearHistory() {
        if (!confirm('Delete ALL history records? This cannot be undone.')) return;
        localStorage.removeItem('bayplanHistory');
        this.renderHistoryTable();
    }
'''

with open('script.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Insert HISTORY_CODE before the closing brace of the class (before the line '}')
# The class ends with '}\n\n// Global instance'
insert_before = '}\n\n// Global instance'
if insert_before in content:
    content = content.replace(insert_before, HISTORY_CODE + '\n}\n\n// Global instance', 1)
    
    # Also update the global initialization block at the end
    old_init = '// Global instance\nwindow.simulator = new BayplanSimulator();\nwindow.sim = window.simulator; // alias for inline HTML handlers\n'
    new_init = '''// Global instance
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
'''
    content = content.replace(old_init, new_init, 1)

    with open('script.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print('SUCCESS: History methods added to script.js')
else:
    print('ERROR: Insertion point not found')
    idx = content.find('// Global instance')
    print(repr(content[idx-30:idx+20]))
