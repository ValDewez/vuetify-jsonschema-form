// Some util functions around schema manipulation to reduce size of the Property component

const schemaUtils = {}

export default schemaUtils

const objectToArray = (obj) => Object.keys(obj || {}).map(key => ({ ...obj[key], key }))

const getDeepKey = (obj, key) => {
  const keys = key.split('.')
  for (let i = 0; i < keys.length; i++) {
    if ([null, undefined].includes(obj)) break
    obj = obj[keys[i]]
  }
  return obj
}

const extendSchema = (schema, subSchema) => {
  schema.required = schema.required.concat(subSchema.required || [])
  schema.properties = schema.properties.concat(objectToArray(subSchema.properties))
  if (subSchema.oneOf) schema.oneOf = (schema.oneOf || []).concat(subSchema.oneOf)
  if (subSchema.allOf) schema.allOf = (schema.allOf || []).concat(subSchema.allOf)
}

schemaUtils.prepareFullSchema = (schema, value, options) => {
  const fullSchema = JSON.parse(JSON.stringify(schema))

  if (fullSchema.pattern) fullSchema.patternRegexp = new RegExp(fullSchema.pattern)

  if (!fullSchema.type && fullSchema.properties) fullSchema.type = 'object'
  if (Array.isArray(fullSchema.type)) {
    fullSchema.nullable = fullSchema.type.includes('null')
    fullSchema.type = fullSchema.type.find(t => t !== 'null')
    if (fullSchema.nullable && fullSchema.enum) fullSchema.enum = fullSchema.enum.filter(v => v !== null)
  }
  if (fullSchema.type !== 'object') return fullSchema

  // Properties as array for easier loops
  fullSchema.properties = JSON.parse(JSON.stringify(objectToArray(fullSchema.properties)))
  fullSchema.required = fullSchema.required || []
  fullSchema.dependencies = fullSchema.dependencies || {}

  // Extend schema based on satisfied dependencies
  if (fullSchema.dependencies) {
    Object.keys(fullSchema.dependencies).forEach(depKey => {
      const dep = fullSchema.dependencies[depKey]
      // cases where dependency does not apply
      if (!value) return
      const val = getDeepKey(value, depKey)
      if ([null, undefined, false].includes(val)) return
      if (Array.isArray(val) && val.length === 0) return
      if (typeof val === 'object' && Object.keys(val).length === 0) return

      // dependency applies
      extendSchema(fullSchema, dep)
    })
  }

  // extend schema based on conditions
  if (fullSchema.if) {
    if (!options.validator) {
      console.error('v-jsf - The conditional if/then/else syntax requires the ajv or other validator option.')
    } else {
      // TODO: store this somewhere so that it is not re-compiled many times
      const validate = options.validator(fullSchema.if)
      const error = validate(value)
      if (!error && fullSchema.then) {
        extendSchema(fullSchema, fullSchema.then)
      }
      if (error && fullSchema.else) {
        extendSchema(fullSchema, fullSchema.else)
      }
    }
  }
  return fullSchema
}
