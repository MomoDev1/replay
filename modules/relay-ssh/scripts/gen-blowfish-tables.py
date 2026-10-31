# Regenerates ios/BlowfishTables.swift: python3 scripts/gen-blowfish-tables.py ios/BlowfishTables.swift
# Hex digits of pi's fractional part (Machin's formula, fixed point), used for the Blowfish P-array and S-boxes.
import sys
words = 18 + 4 * 256
digits = words * 8
bits = digits * 4 + 64
one = 1 << bits
def atan_inv(x):
    total = term = one // x
    x2, n, sign = x * x, 1, 1
    while term:
        term //= x2
        n += 2
        sign = -sign
        total += sign * (term // n)
    return total
pi = 16 * atan_inv(5) - 4 * atan_inv(239)
frac = (pi - 3 * one) >> 64
h = format(frac, '0%dx' % (bits // 4 - 16))[:digits]
w = [h[i*8:(i+1)*8].upper() for i in range(words)]
assert w[0] == '243F6A88' and w[18] == 'D1310BA6' and w[18+256] == '4B7A70E9' and w[18+512] == 'E93D5A68' and w[18+768] == '3A39CE37', w[:2]
assert w[17] == '8979FB1B' and w[-1] == '3AC372E6', (w[17], w[-1])
def arr(name, xs):
    lines = [', '.join('0x' + x for x in xs[i:i+6]) for i in range(0, len(xs), 6)]
    return f'  static let {name}: [UInt32] = [\n    ' + ',\n    '.join(lines) + ',\n  ]\n'
out = '// Generated from the hexadecimal digits of pi (Blowfish initial state). Do not edit.\n\nenum BlowfishTables {\n'
out += arr('p', w[:18])
for i in range(4):
    out += arr(f's{i}', w[18 + 256*i: 18 + 256*(i+1)])
out += '}\n'
open(sys.argv[1], 'w').write(out)
print('ok')
