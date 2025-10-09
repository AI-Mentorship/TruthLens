backend
fastapi
from fastapi import FastAPI, HTTPException # indicating the main api which is FastAPI and the import is to find the errors
from pydantic import BaseModel # this checks the data to make sure its valid and it will be sent back to the application
import requests # this import statement is letting us use the external api in this program

# this line creates the web application and it uses FastAPI
app = FastAPI()

# this is the link to the external api
# in this case it is 'sapling' but it will be changed to GPTZero later
api_link = "https://api.sapling.ai/api/v1/aidetect"

# this is the bearer key
# the purpose of this is for authorization
api_private_key = "L5GO02U1QNW2WNTAGDUZV3Q705OPMUP6"

# text model that is received from the user
# this will be used for input validation
class TextFromFrontEnd(BaseModel):
   text: str # setting this variable to 'None' is not necessary, this can be removed if needed

# this is sending the post request to '/check-text'
@app.post("/check-text")
# function that is taking the text from front-end and checking it
def check_ai_text(item: TextFromFrontEnd):
   # this is a header and it includes the api key with it
   authorize = {"Authorization": f"Key {api_private_key}"}
  
   # this is sending the information to the external api (in this cause sapling)
   dataSent = {"text": item.text}

   # not necessary to check for error but makes the program better
   # this will catch issues like invalid api key, no internet, etc.
   try: 
       # this sends the request to the external api (in this case, it is sapling)
       response = requests.post(api_link, headers=authorize, json=dataSent)
       # this line is going to check for the actual errors
       response.raise_for_status()
   except requests.exceptions.RequestException as e:
       # this will return the HTTP error with information on the error if this part goes through
       raise HTTPException(status_code=500, detail=f"API error: {str(e)}")
  
   # this is returning back the results to the front-end that was examined by the external api (which ever one choose)
   return response.json()
