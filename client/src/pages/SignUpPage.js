import React, {useState} from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import SignUpForm from '../components/SignUpForm';
import { useNavigate } from 'react-router-dom';
import socket from '../socket';

function SignUpPage() {
    const [err, setErr] = useState(null);
    const navigate = useNavigate(); 
  
    const signUp = async (body) => { 
        socket.timeout(5000).emit('register', { email: body.email, password: body.password, name: body.name});
        socket.on('registerResponse', (data) => {
            console.log(data);
            if (data !== 'Register error') {
                if (data === 'Email already exist') {
                    setErr('Аккаунт с таким email существует');
                } else {
                    console.log('Регистрация прошла успешно!');
                    alert('Регистрация прошла успешно!');
                    document.cookie = data.token + '; max-age=3600; path=/;';
                    document.cookie = data.id + '; max-age=3600; path=/;';
                    setErr(null);

                    navigate("/");
                    window.location.reload();                    
                }
            }
        });
    };
  
    return (
        <div className="wrapper">
            <Header/>
            <div className="sign-content">
                <SignUpForm
                    signUp={signUp}
                    serverErr={err}
                />
            </div>  
            <Footer/>  
        </div>
    )
  }
  
  export default SignUpPage; 