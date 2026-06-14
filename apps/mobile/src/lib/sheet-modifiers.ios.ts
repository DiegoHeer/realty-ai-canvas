import { frame, type ModifierConfig } from '@expo/ui/swift-ui/modifiers';

/**
 * iOS: a wide `frame` stands in for SwiftUI's `.frame(maxWidth: .infinity)`
 * (the typed `frame` modifier takes a number), so the row spans the sheet.
 */
export const FILL_WIDTH: ModifierConfig[] = [frame({ maxWidth: 9999 })];
