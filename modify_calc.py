with open('script.js', 'r', encoding='utf-8') as f:
    content = f.read()

import re

# 1. Add event listeners inside setupEventListeners
listener_new = '''
        ['calcProd', 'calcGang', 'calcTargetBerth'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => this.updateSimulationCalc());
        });
'''
# We will insert it just after setupDropZone block inside setupEventListeners
content = re.sub(r'(this\.setupDropZone\(\'dropZoneLod\', \(data\) => \{\s*this\.parseEDI\(data\);\s*this\.updateUI\(\);\s*\}, \'fileNameLod\'\);)', r'\1' + '\n' + listener_new, content)

# Remove old simulation button listeners if they exist
content = re.sub(r'document\.getElementById\(\'calcGCBtn\'\)\.addEventListener[^\n]+\n', '', content)
content = re.sub(r'document\.getElementById\(\'analyzeBtn\'\)\.addEventListener[^\n]+\n', '', content)

# 2. Add updateSimulationCalc method
# We can inject it right after `renderKpi()` method
calc_method = '''
    updateSimulationCalc() {
        const totalBoxText = document.getElementById('kpiActualBoxes')?.textContent || '0';
        const totalMoves = parseInt(totalBoxText) || 0;
        
        const prod = parseFloat(document.getElementById('calcProd')?.value) || 1;
        const gangs = parseFloat(document.getElementById('calcGang')?.value) || 1;
        const targetHours = parseFloat(document.getElementById('calcTargetBerth')?.value) || 12;

        // 1. Required Berth Time = (moves / (prod * gangs)) + 2 prep hours
        const reqBerth = (totalMoves / (prod * gangs)) + 2;
        
        // 2. Required Gangs = moves / (prod * (targetHours - 2))
        const effectiveHours = Math.max(targetHours - 2, 0.1); 
        const reqGangs = totalMoves / (prod * effectiveHours);

        document.getElementById('outRequiredBerth').textContent = reqBerth > 2 ? reqBerth.toFixed(1) + 'h' : '-';
        document.getElementById('outRequiredGang').textContent = reqGangs > 0 ? Math.ceil(reqGangs) : '-';
    }
'''

# Call updateSimulationCalc() at the end of renderKpi
if 'updateSimulationCalc()' not in content:
    content = re.sub(r'(document\.getElementById\(\'kpiTwinCount\'\)\.textContent = twinCount;\s*document\.getElementById\(\'kpiActualBoxes\'\)\.textContent = actualBoxes;\s*\}?)', r'\1\n        this.updateSimulationCalc();\n', content)
    
    # insert method after renderKpi
    content = content.replace('    renderKpi() {', calc_method + '\n    renderKpi() {')

# Remove calcSimulation method if exists
content = re.sub(r'calcSimulation\([^\)]*\)\s*\{[\s\S]*?renderSimulationTab\(\)\s*\{[\s\S]*?\}?\s*\}\s*}(?=\s*renderListRecap|\s*exportExcel|\s*populateHistoryForm)', '}', content)

with open('script.js', 'w', encoding='utf-8') as f:
    f.write(content)
print('SUCCESS: Script updated for simulation calculation directly in recap View')
