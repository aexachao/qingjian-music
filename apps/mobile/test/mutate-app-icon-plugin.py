#!/usr/bin/env python3
"""变异测试：往 plugins/with-app-icons.js 里注入破坏，确认 app-icon-plugin.test.ts 会红。

硬规则 #5：永远为真的检查比没有检查更糟。新增断言必须能造出会失败的样本。
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / 'plugins/with-app-icons.js'
TEST = 'test/unit/app-icon-plugin.test.ts'

MUTATIONS = [
    (
        '背景色回退成裸色值（就是 CI 上挂掉的那个 bug）',
        '`  <background android:drawable="@color/${iconBackgroundColorName(icon)}" />`',
        '`  <background android:drawable="${iconBackgroundColor(icon)}" />`',
    ),
    (
        '干脆不写 values 文件（同样链接期失败）',
        """  fs.writeFileSync(
    path.join(valuesRoot, 'app_icon_backgrounds.xml'),
    buildIconColorResourcesXml(ICONS),
  )""",
        '  void valuesRoot',
    ),
    (
        '背景色资源名退化成常量（四款图标抢同一个资源）',
        "return `${icon.resource}_background`",
        "return 'app_icon_background'",
    ),
    (
        'v33 变体丢掉 monochrome 层',
        """  if (themed) {
    lines.push(`  <monochrome android:drawable="@drawable/${icon.resource}_monochrome" />`)
  }""",
        '  void themed',
    ),
    (
        '漏拷 legacy 位图（API < 26 无图标）',
        "    fs.copyFileSync(path.join(sourceRoot, `${icon.id}-legacy.png`), path.join(legacyRoot, `${icon.resource}.png`))\n",
        '',
    ),
    (
        'values 只声明第一款图标的颜色',
        '    ...icons.map(',
        '    ...icons.slice(0, 1).map(',
    ),
    (
        'values 目录不创建（写文件时 ENOENT）',
        "const valuesRoot = path.join(resRoot, 'values')\n  for (const dir of [drawableRoot, legacyRoot, adaptiveRoot, themedRoot, valuesRoot]) {",
        "const valuesRoot = path.join(resRoot, 'values')\n  for (const dir of [drawableRoot, legacyRoot, adaptiveRoot, themedRoot]) {",
    ),
    (
        '前景误用 @color 引用',
        '`  <foreground android:drawable="@drawable/${icon.resource}_foreground" />`',
        '`  <foreground android:drawable="@color/${iconBackgroundColorName(icon)}" />`',
    ),
]

original = PLUGIN.read_text()


def run_tests() -> bool:
    proc = subprocess.run(
        ['node', 'node_modules/vitest/vitest.mjs', 'run', TEST],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    return proc.returncode == 0


try:
    if not run_tests():
        print('基线就是红的，先修好再跑变异')
        sys.exit(1)

    caught = 0
    for i, (name, old, new) in enumerate(MUTATIONS, 1):
        if old not in original:
            print(f'  {i}. 跳过（匹配串找不到，说明源码变了）：{name}')
            continue
        PLUGIN.write_text(original.replace(old, new, 1))
        try:
            passed = run_tests()
        finally:
            PLUGIN.write_text(original)
        if passed:
            print(f'  {i}. ✗ 漏网（用例是摆设）：{name}')
        else:
            caught += 1
            print(f'  {i}. ✓ 被抓住：{name}')

    total = len(MUTATIONS)
    print(f'\n{caught}/{total} 个变异被测试抓住')
    sys.exit(0 if caught == total else 1)
finally:
    PLUGIN.write_text(original)
