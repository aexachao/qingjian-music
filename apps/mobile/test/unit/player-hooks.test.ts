import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const playerPath = fileURLToPath(new URL('../../src/app/player.tsx', import.meta.url))
const setupPath = fileURLToPath(new URL('../../src/player/setup.ts', import.meta.url))

function isHookCall(node: ts.Node): boolean {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    /^use[A-Z]/.test(node.expression.text)
  )
}

function hookCallsWithin(node: ts.Node): string[] {
  const names: string[] = []
  const visit = (child: ts.Node) => {
    if (isHookCall(child)) names.push((child as ts.CallExpression).expression.getText())
    ts.forEachChild(child, visit)
  }
  visit(node)
  return names
}

describe('PlayerScreen Hook 顺序', () => {
  it('不启用无人监听的原生进度事件', () => {
    expect(readFileSync(setupPath, 'utf8')).not.toContain('progressUpdateEventInterval')
  })

  it('空队列分支之后不再调用 Hook', () => {
    const source = ts.createSourceFile(
      playerPath,
      readFileSync(playerPath, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    const screen = source.statements.find(
      (statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement) && statement.name?.text === 'PlayerScreen',
    )
    expect(screen?.body).toBeDefined()

    const emptyBranch = screen?.body?.statements.find(
      (statement) => ts.isIfStatement(statement) && statement.expression.getText(source) === '!current',
    )
    expect(emptyBranch).toBeDefined()

    const following = screen?.body?.statements.filter(
      (statement) => emptyBranch !== undefined && statement.pos >= emptyBranch.end,
    ) ?? []
    expect(following.flatMap(hookCallsWithin)).toEqual([])
  })
})
