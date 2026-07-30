// handler.ts

import {
  LambdaClient,
  ListFunctionsCommand
} from '@aws-sdk/client-lambda'

const client =
  new LambdaClient({})


export const handler = async () => {

  try {

    const functions = []

    let marker: string | undefined


    do {

      const command =
        new ListFunctionsCommand({
          Marker: marker
        })


      const response =
        await client.send(command)


      if (response.Functions) {
        functions.push(
          ...response.Functions
        )
      }


      marker =
        response.NextMarker

    } while (marker)


    return {
      statusCode: 200,

      headers: {
        'Content-Type':
          'application/json'
      },

      body: JSON.stringify({
        functions
      })
    }

  } catch (error) {

    console.error(
      'Failed to list Lambda functions:',
      error
    )


    return {
      statusCode: 500,

      headers: {
        'Content-Type':
          'application/json'
      },

      body: JSON.stringify({
        error:
          'Failed to list Lambda functions'
      })
    }

  }

}