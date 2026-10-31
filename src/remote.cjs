/** Hand-written strict Typert wire contract shared by both plugin faces. */
function updateContribution(z) {
  const namespace = 'hzhospitalUpdates'
  const packageName = 'dsh-plugin-hzhospital'
  const codec = create => ({ mode: 'strict', typeSymbol: `${packageName}#UpdateWire`, create })
  const stateSchema = () => z.object({
    currentVersion: z.string(), status: z.enum(['idle', 'checking', 'available', 'current', 'error', 'installing', 'restart-required']),
    checkedAt: z.number().nullable(), latestVersion: z.string().nullable(), commit: z.string().nullable(),
    message: z.string(), canUpdate: z.boolean(),
  })
  const methods = {
    check: [{ name: 'force', schema: () => z.boolean() }],
    getState: [],
    update: [{ name: 'commit', schema: () => z.string().regex(/^[a-f0-9]{40}$/) }],
  }
  return { package: packageName, descriptors: Object.entries(methods).map(([method, parameters]) => ({
    id: `${packageName}#${namespace}/${method}`, namespace, service: namespace, method,
    invocation: { kind: 'direct' },
    parameters: parameters.map(({ name, schema }) => ({ name, wire: name, source: 'json', codec: codec(schema), strictCodec: codec(schema) })),
    result: codec(stateSchema),
  })) }
}
module.exports = { updateContribution }
