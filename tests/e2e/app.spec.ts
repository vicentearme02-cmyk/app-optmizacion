import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test('el panel muestra el perfil de demostración y permite analizarlo', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByText('Intel Core i5-9400F', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('AMD Radeon RX 560', { exact: false }).first()).toBeVisible()
  await expect(page.getByText(/demostración/i).first()).toBeVisible()
  await page.getByRole('button', { name: 'Analizar PC', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Analizar PC', exact: true })).toBeEnabled()
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true })
  expect(errors).toEqual([])
})

test('el catálogo filtra por búsqueda y comunica resultados vacíos', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^Optimizaciones/ }).click()
  expect(await page.getByRole('switch').count()).toBeGreaterThanOrEqual(51)
  const search = page.getByPlaceholder('Buscar optimizaciones...')
  await search.fill('Modo Juego de Windows')
  await expect(page.getByRole('heading', { name: 'Modo Juego de Windows', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Reducir transparencias', exact: true })).toHaveCount(0)
  await search.fill('no-existe-ajuste-123')
  await expect(page.getByText(/sin resultados|no encontramos|no hay ajustes/i).first()).toBeVisible()
  await search.clear()
  await expect(page.getByRole('heading', { name: 'Reducir transparencias', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'FPS y latencia', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Modo Juego de Windows', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Reducir transparencias', exact: true })).toHaveCount(0)
})

test('un cambio simulado persiste y se puede restaurar desde el historial', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^Optimizaciones/ }).click()
  const toggle = page.getByRole('switch', { name: /Modo Juego de Windows/ })
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: /Aplicar selección/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: /Aplicar .*ajuste|Simular/i }).click()
  await expect(page.getByRole('dialog', { name: 'Todo listo.' })).toBeVisible()
  await page.getByRole('button', { name: 'Entendido' }).click()
  await page.reload()
  await page.getByRole('button', { name: /^Optimizaciones/ }).click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: 'Historial', exact: true }).click()
  await page.getByRole('button', { name: /Restaurar/ }).first().click()
  const restore = page.getByRole('dialog')
  await expect(restore).toBeVisible()
  await restore.getByRole('button', { name: /Restaurar|Confirmar/ }).click()
  await expect(page.getByRole('dialog', { name: 'Todo listo.' })).toBeVisible()
  await page.getByRole('button', { name: 'Entendido' }).click()
  await page.getByRole('button', { name: /^Optimizaciones/ }).click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
})

test('las secciones se pueden navegar sin errores de ejecución', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  for (const name of ['Optimizaciones', 'Mi hardware', 'Historial', 'Configuración', 'Vista general']) {
    await page.getByRole('button', { name: name === 'Optimizaciones' ? /^Optimizaciones/ : name, exact: name !== 'Optimizaciones' }).click()
    await expect(page.locator('main')).toBeVisible()
  }
  expect(errors).toEqual([])
})

test('el diseño mantiene el contenido dentro de una pantalla móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByText('Intel Core i5-9400F', { exact: false }).first()).toBeVisible()
  const widths = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }))
  expect(widths.content).toBeLessThanOrEqual(widths.viewport)
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true })
})


test('los detalles admiten teclado y devuelven el foco al cerrar', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^Optimizaciones/ }).click()
  const details = page.getByRole('button', { name: 'Detalles: Modo Juego de Windows' })
  await details.click()
  const dialog = page.getByRole('dialog', { name: 'Detalles del ajuste' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: 'Seleccionar ajuste' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Cerrar diálogo' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(details).toBeFocused()
})


test('las preferencias persisten y el informe exportado identifica la demostración', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Configuración', exact: true }).click()
  const automatic = page.getByRole('switch', { name: 'Monitor de hardware automático' })
  await expect(automatic).toHaveAttribute('aria-checked', 'true')
  await automatic.click()
  await page.getByRole('switch', { name: 'Reducir animaciones' }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Configuración', exact: true }).click()
  await expect(automatic).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByRole('switch', { name: 'Reducir animaciones' })).toHaveAttribute('aria-checked', 'true')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar diagnóstico local' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('maximo-fps-informe.json')
  const report = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(report.system.mode).toBe('demo')
  expect(report.system.cpu.name).toContain('i5-9400F')
  expect(report.system.gpu.name).toContain('RX 560')
  expect(report.backups).toEqual([])
})

test('un fallo nativo de permisos se informa y no se marca como aplicado', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      optimizer: {
        getSystemInfo: async () => ({
          mode: 'native', platform: 'win32',
          cpu: { name: 'CPU de prueba', cores: 6, usage: 8 },
          gpu: { name: 'GPU de prueba', memoryGB: 4, usage: null },
          ram: { totalGB: 16, usedGB: 4, type: 'DDR4' },
          storage: { totalGB: 512, freeGB: 256, drives: [] },
          os: 'Windows de prueba', updatedAt: new Date().toISOString(), admin: false,
        }),
        getTweakStates: async () => ({ 'game-mode': false }),
        listBackups: async () => [],
        applyTweaks: async (ids: string[]) => ({
          success: false,
          message: 'No se pudo aplicar el cambio por permisos insuficientes.',
          results: ids.map(id => ({ id, success: false, message: 'Acceso denegado.' })),
        }),
        restoreBackup: async () => { throw new Error('No hay copia.') },
        windowControl: () => {},
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: /^Optimizaciones/ }).click()
  await page.getByRole('switch', { name: 'Modo Juego de Windows', exact: true }).click()
  await page.getByRole('button', { name: 'Aplicar selección' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Aplicar 1 ajustes' }).click()
  const result = page.getByRole('dialog', { name: 'Revisa el resultado.' })
  await expect(result).toBeVisible()
  await expect(result.getByText('Acceso denegado.')).toBeVisible()
  await result.getByRole('button', { name: 'Entendido' }).click()
  await expect(page.getByText('0 activos · 1 seleccionados', { exact: true })).toBeVisible()
})
