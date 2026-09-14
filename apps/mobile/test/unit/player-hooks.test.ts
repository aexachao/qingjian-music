import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { hasNoCode, readRawSource } from '../support/source'

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
    expect(hasNoCode('player/setup.ts', 'progressUpdateEventInterval')).toBe(true)
  })

  it('空队列分支之后不再调用 Hook', () => {
    const source = ts.createSourceFile(
      'player.tsx',
      readRawSource('app/player.tsx'),
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
